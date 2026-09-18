param(
  [string]$GitHubRepoUrl = ""
)

. (Join-Path $PSScriptRoot "common.ps1")

$config = Import-Phase4Config
$state = Get-Phase4State

# -------------------------------------------------------------------
# Validate deployment state
# -------------------------------------------------------------------

Write-Step "Validating verified live deployment state"

if (-not $state.ContainsKey("apiUrl")) {
  throw "Deployment state does not contain apiUrl. Run deploy/03-deploy-api.ps1 first."
}

if (-not $state.ContainsKey("hostingUrl")) {
  throw "Deployment state does not contain hostingUrl. Run deploy/04-deploy-web.ps1 first."
}

$apiUrl = [string]$state["apiUrl"]
$hostingUrl = [string]$state["hostingUrl"]

if ([string]::IsNullOrWhiteSpace($apiUrl)) {
  throw "Deployment state contains an empty API URL."
}

if ([string]::IsNullOrWhiteSpace($hostingUrl)) {
  throw "Deployment state contains an empty Hosting URL."
}

$apiUrl = $apiUrl.TrimEnd("/")
$hostingUrl = $hostingUrl.TrimEnd("/")

$hostingAlternateUrl = Get-HostingAlternateUrl $config.ProjectId

# -------------------------------------------------------------------
# Require successful full production smoke test
# -------------------------------------------------------------------

if (
  -not $state.ContainsKey("liveSmokeVerified") -or
  $state["liveSmokeVerified"] -ne $true
) {
  throw @"
The full production smoke test has not been recorded as successful.

Run:

  .\deploy\05-smoke-test.ps1 -CsvPath "C:\path\to\monitoring_checks_9d_seed101.csv"

before recording the final live deployment.
"@
}

if (
  -not $state.ContainsKey("liveSmokeVerifiedAtUtc") -or
  [string]::IsNullOrWhiteSpace(
    [string]$state["liveSmokeVerifiedAtUtc"]
  )
) {
  throw "The live smoke-test verification timestamp is missing."
}

$verifiedAt = [string]$state["liveSmokeVerifiedAtUtc"]

# -------------------------------------------------------------------
# Load detailed smoke-test evidence
# -------------------------------------------------------------------

$smokePath = Join-Path `
  $PSScriptRoot `
  ".phase4-smoke.json"

if (-not (Test-Path $smokePath -PathType Leaf)) {
  throw @"
The live smoke-test evidence file is missing:

  $smokePath

Rerun deploy/05-smoke-test.ps1 with the real CSV.
"@
}

$smokeJson = Get-Content `
  -Raw `
  -Path $smokePath

if ([string]::IsNullOrWhiteSpace($smokeJson)) {
  throw "The live smoke-test evidence file is empty."
}

try {
  $smoke = $smokeJson |
    ConvertFrom-Json
}
catch {
  throw "The live smoke-test evidence file is not valid JSON."
}

if ($smoke.fullEndToEnd -ne "PASS") {
  throw "The recorded production smoke test does not report fullEndToEnd=PASS."
}

$requiredSmokeChecks = @(
  "hosting",
  "alternateHosting",
  "health",
  "cors",
  "corsPreflight",
  "upload",
  "localHashMatch",
  "persistence",
  "metadata",
  "summary",
  "dateFilter",
  "logs",
  "pagination",
  "serviceFilter",
  "idempotency"
)

foreach ($check in $requiredSmokeChecks) {
  $property = $smoke.PSObject.Properties[$check]

  if (
    $null -eq $property -or
    [string]$property.Value -ne "PASS"
  ) {
    throw "Smoke-test check '$check' is not PASS."
  }
}

Write-Host "Full live smoke evidence verified."

# -------------------------------------------------------------------
# GitHub repository value
# -------------------------------------------------------------------

$githubDisplayValue = "PENDING"

if (-not [string]::IsNullOrWhiteSpace($GitHubRepoUrl)) {
  $GitHubRepoUrl = $GitHubRepoUrl.Trim().TrimEnd("/")

  if (
    $GitHubRepoUrl -notmatch
      '^https://github\.com/[^/]+/[^/]+$'
  ) {
    throw @"
GitHubRepoUrl does not look like a GitHub repository URL.

Expected form:

  https://github.com/OWNER/REPOSITORY
"@
  }

  $githubDisplayValue = $GitHubRepoUrl
}

# -------------------------------------------------------------------
# Extract verified smoke-test values
# -------------------------------------------------------------------

$uploadId = [string]$smoke.uploadId
$sourceRows = [string]$smoke.sourceRows
$storedObservations = [string]$smoke.storedObservations
$exactDuplicates = [string]$smoke.exactDuplicateRowsRemoved
$serviceCount = [string]$smoke.serviceCount
$expectedIntervals = [string]$smoke.expectedIntervals
$resolvedIntervals = [string]$smoke.resolvedIntervals
$availabilityPercent = [string]$smoke.availabilityPercent
$coveragePercent = [string]$smoke.coveragePercent
$downtimeMinutes = [string]$smoke.detectedDowntimeMinutes
$apiVersion = [string]$smoke.apiVersion

# -------------------------------------------------------------------
# Build docs/LIVE_DEPLOYMENT.md
# -------------------------------------------------------------------

Write-Step "Writing verified live deployment record"

$deploymentRecord = @"
# Live Deployment Record

## URLs

- **GitHub repository:** $githubDisplayValue
- **Live application:** $hostingUrl
- **Alternate Hosting URL:** $hostingAlternateUrl
- **API base URL:** $apiUrl
- **API health:** $apiUrl/v1/health

## Infrastructure

- **Google Cloud project:** $($config.ProjectId)
- **Cloud Run service:** $($config.ApiServiceName)
- **Cloud Run region:** $($config.Region)
- **Firestore database:** (default)
- **Firestore location:** $($config.FirestoreLocation)
- **Runtime service account:** $($state["runtimeServiceAccount"])

## Verified production smoke test

- **Status:** PASS
- **Last verified live (UTC):** $verifiedAt
- **API version:** $apiVersion
- **Upload ID / SHA-256:** $uploadId
- **Source rows:** $sourceRows
- **Stored observations:** $storedObservations
- **Exact duplicate rows removed:** $exactDuplicates
- **Services:** $serviceCount
- **Expected SLA intervals:** $expectedIntervals
- **Resolved SLA intervals:** $resolvedIntervals
- **Availability:** $availabilityPercent%
- **Coverage:** $coveragePercent%
- **Detected downtime:** $downtimeMinutes minutes

The live verification exercised Firebase Hosting, API health, browser CORS
preflight, CSV upload, content-addressed SHA-256 identity, Firestore
persistence, metadata retrieval, summary retrieval, date filtering, logs,
cursor pagination, service filtering, and idempotent duplicate upload.

## Redeploy

From the repository root:

```powershell
.\deploy\00-preflight.ps1
.\deploy\01-enable-services.ps1
.\deploy\02-firestore.ps1
.\deploy\03-deploy-api.ps1
.\deploy\04-deploy-web.ps1
.\deploy\05-smoke-test.ps1 -CsvPath "C:\path\to\monitoring_checks_9d_seed101.csv"
.\deploy\06-record-live-urls.ps1 -GitHubRepoUrl "https://github.com/OWNER/REPOSITORY"