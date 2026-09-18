param(
  [string]$GitHubRepoUrl = ""
)

. (Join-Path $PSScriptRoot "common.ps1")

$config = Import-Phase4Config
$state = Get-Phase4State

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

function Get-ObjectPropertyValue {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Object,

    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ($null -eq $Object) {
    return $null
  }

  $property = $Object.PSObject.Properties[$Name]

  if ($null -eq $property) {
    return $null
  }

  return $property.Value
}

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
  throw (
    "The full production smoke test has not been recorded as successful.`r`n`r`n" +
    "Run:`r`n`r`n" +
    "  .\deploy\05-smoke-test.ps1 -CsvPath `"C:\path\to\monitoring_checks_9d_seed101.csv`"`r`n`r`n" +
    "before recording the final live deployment."
  )
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
  throw (
    "The live smoke-test evidence file is missing:`r`n`r`n" +
    "  $smokePath`r`n`r`n" +
    "Rerun deploy/05-smoke-test.ps1 with the real CSV."
  )
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

$fullEndToEnd = [string](
  Get-ObjectPropertyValue `
    -Object $smoke `
    -Name "fullEndToEnd"
)

if ($fullEndToEnd -ne "PASS") {
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
  $checkValue = [string](
    Get-ObjectPropertyValue `
      -Object $smoke `
      -Name $check
  )

  if ($checkValue -ne "PASS") {
    throw "Smoke-test check '$check' is not PASS. Current value: '$checkValue'."
  }
}

Write-Host "Full live smoke evidence verified."

# -------------------------------------------------------------------
# Validate GitHub repository URL
# -------------------------------------------------------------------

$githubDisplayValue = "PENDING"

if (-not [string]::IsNullOrWhiteSpace($GitHubRepoUrl)) {
  $GitHubRepoUrl = $GitHubRepoUrl.Trim().TrimEnd("/")

  if (
    $GitHubRepoUrl -notmatch
      '^https://github\.com/[^/]+/[^/]+$'
  ) {
    throw (
      "GitHubRepoUrl does not look like a GitHub repository URL.`r`n`r`n" +
      "Expected form:`r`n`r`n" +
      "  https://github.com/OWNER/REPOSITORY"
    )
  }

  $githubDisplayValue = $GitHubRepoUrl
}

# -------------------------------------------------------------------
# Extract verified smoke-test values
# -------------------------------------------------------------------

$uploadId = [string](
  Get-ObjectPropertyValue `
    -Object $smoke `
    -Name "uploadId"
)

$sourceRows = [string](
  Get-ObjectPropertyValue `
    -Object $smoke `
    -Name "sourceRows"
)

$storedObservations = [string](
  Get-ObjectPropertyValue `
    -Object $smoke `
    -Name "storedObservations"
)

$exactDuplicates = [string](
  Get-ObjectPropertyValue `
    -Object $smoke `
    -Name "exactDuplicateRowsRemoved"
)

$serviceCount = [string](
  Get-ObjectPropertyValue `
    -Object $smoke `
    -Name "serviceCount"
)

$expectedIntervals = [string](
  Get-ObjectPropertyValue `
    -Object $smoke `
    -Name "expectedIntervals"
)

$resolvedIntervals = [string](
  Get-ObjectPropertyValue `
    -Object $smoke `
    -Name "resolvedIntervals"
)

$availabilityPercent = [string](
  Get-ObjectPropertyValue `
    -Object $smoke `
    -Name "availabilityPercent"
)

$coveragePercent = [string](
  Get-ObjectPropertyValue `
    -Object $smoke `
    -Name "coveragePercent"
)

$downtimeMinutes = [string](
  Get-ObjectPropertyValue `
    -Object $smoke `
    -Name "detectedDowntimeMinutes"
)

$apiVersion = [string](
  Get-ObjectPropertyValue `
    -Object $smoke `
    -Name "apiVersion"
)

# -------------------------------------------------------------------
# Runtime identity for documentation
# -------------------------------------------------------------------

$runtimeServiceAccount = "Not recorded"

if (
  $state.ContainsKey("runtimeServiceAccount") -and
  -not [string]::IsNullOrWhiteSpace(
    [string]$state["runtimeServiceAccount"]
  )
) {
  $runtimeServiceAccount = [string]$state["runtimeServiceAccount"]
}

# -------------------------------------------------------------------
# Build docs/LIVE_DEPLOYMENT.md
#
# Use arrays of lines instead of PowerShell here-strings so this works
# reliably under Windows PowerShell 5.1.
# -------------------------------------------------------------------

Write-Step "Writing verified live deployment record"

$deploymentRecordLines = @(
  "# Live Deployment Record",
  "",
  "## URLs",
  "",
  "- **GitHub repository:** $githubDisplayValue",
  "- **Live application:** $hostingUrl",
  "- **Alternate Hosting URL:** $hostingAlternateUrl",
  "- **API base URL:** $apiUrl",
  "- **API health:** $apiUrl/v1/health",
  "",
  "## Infrastructure",
  "",
  "- **Google Cloud project:** $($config.ProjectId)",
  "- **Cloud Run service:** $($config.ApiServiceName)",
  "- **Cloud Run region:** $($config.Region)",
  "- **Firestore database:** (default)",
  "- **Firestore location:** $($config.FirestoreLocation)",
  "- **Runtime service account:** $runtimeServiceAccount",
  "",
  "## Verified production smoke test",
  "",
  "- **Status:** PASS",
  "- **Last verified live (UTC):** $verifiedAt",
  "- **API version:** $apiVersion",
  "- **Upload ID / SHA-256:** $uploadId",
  "- **Source rows:** $sourceRows",
  "- **Stored observations:** $storedObservations",
  "- **Exact duplicate rows removed:** $exactDuplicates",
  "- **Services:** $serviceCount",
  "- **Expected SLA intervals:** $expectedIntervals",
  "- **Resolved SLA intervals:** $resolvedIntervals",
  "- **Availability:** $availabilityPercent%",
  "- **Coverage:** $coveragePercent%",
  "- **Detected downtime:** $downtimeMinutes minutes",
  "",
  "The live verification exercised Firebase Hosting, API health, browser CORS",
  "preflight, CSV upload, content-addressed SHA-256 identity, Firestore",
  "persistence, metadata retrieval, summary retrieval, date filtering, logs,",
  "cursor pagination, service filtering, and idempotent duplicate upload.",
  "",
  "## Redeploy",
  "",
  "From the repository root:",
  "",
  '```powershell',
  '.\deploy\00-preflight.ps1',
  '.\deploy\01-enable-services.ps1',
  '.\deploy\02-firestore.ps1',
  '.\deploy\03-deploy-api.ps1',
  '.\deploy\04-deploy-web.ps1',
  '.\deploy\05-smoke-test.ps1 -CsvPath "C:\path\to\monitoring_checks_9d_seed101.csv"',
  '.\deploy\06-record-live-urls.ps1 -GitHubRepoUrl "https://github.com/OWNER/REPOSITORY"',
  '```',
  "",
  "Do not run `07-clean-release.ps1` until the final README and deployment",
  "evidence have been reviewed."
)

$deploymentRecord = (
  $deploymentRecordLines -join "`r`n"
) + "`r`n"

$recordPath = Join-Path `
  $script:RepoRoot `
  "docs\LIVE_DEPLOYMENT.md"

# -------------------------------------------------------------------
# Build README live-deployment block
# -------------------------------------------------------------------

$readmePath = Join-Path `
  $script:RepoRoot `
  "README.md"

if (-not (Test-Path $readmePath -PathType Leaf)) {
  throw "README.md was not found."
}

$readme = Get-Content `
  -Raw `
  -Path $readmePath

$startMarker = "<!-- PHASE4_LIVE_START -->"
$endMarker = "<!-- PHASE4_LIVE_END -->"

$startIndex = $readme.IndexOf(
  $startMarker,
  [System.StringComparison]::Ordinal
)

$endIndex = $readme.IndexOf(
  $endMarker,
  [System.StringComparison]::Ordinal
)

if (
  $startIndex -lt 0 -or
  $endIndex -lt 0
) {
  throw (
    "README.md does not contain the expected Phase IV live deployment markers.`r`n`r`n" +
    "Expected:`r`n`r`n" +
    "  $startMarker`r`n" +
    "  $endMarker`r`n`r`n" +
    "The README was not modified."
  )
}

if ($endIndex -le $startIndex) {
  throw "README Phase IV live-deployment markers are in the wrong order."
}

$replacementLines = @(
  $startMarker,
  "## Live deployment",
  "",
  "- **GitHub repository:** $githubDisplayValue",
  "- **Live application:** $hostingUrl",
  "- **API base URL:** $apiUrl",
  "- **API health:** $apiUrl/v1/health",
  "- **Production smoke test:** PASS",
  "- **Last verified live (UTC):** $verifiedAt",
  "",
  "The production smoke test verified upload, persistence, summary, date",
  "filtering, logs, cursor pagination, service filtering, browser CORS, and",
  "idempotent re-upload of the supplied monitoring CSV.",
  "",
  $endMarker
)

$replacement = $replacementLines -join "`r`n"

$afterEndIndex = $endIndex + $endMarker.Length

$readmePrefix = $readme.Substring(
  0,
  $startIndex
)

$readmeSuffix = $readme.Substring(
  $afterEndIndex
)

$updatedReadme = `
  $readmePrefix +
  $replacement +
  $readmeSuffix

# -------------------------------------------------------------------
# Write UTF-8 without BOM
# -------------------------------------------------------------------

$utf8WithoutBom = New-Object `
  System.Text.UTF8Encoding($false)

[System.IO.File]::WriteAllText(
  $recordPath,
  $deploymentRecord,
  $utf8WithoutBom
)

[System.IO.File]::WriteAllText(
  $readmePath,
  $updatedReadme,
  $utf8WithoutBom
)

# -------------------------------------------------------------------
# Verify generated documentation
# -------------------------------------------------------------------

Write-Step "Verifying generated deployment documentation"

$writtenRecord = [System.IO.File]::ReadAllText(
  $recordPath
)

$writtenReadme = [System.IO.File]::ReadAllText(
  $readmePath
)

$requiredDocumentationValues = @(
  $githubDisplayValue,
  $hostingUrl,
  $apiUrl,
  $uploadId,
  $verifiedAt
)

foreach ($value in $requiredDocumentationValues) {
  if (
    [string]::IsNullOrWhiteSpace($value)
  ) {
    throw "A required documentation value is empty."
  }

  if (
    $writtenRecord.IndexOf(
      $value,
      [System.StringComparison]::Ordinal
    ) -lt 0
  ) {
    throw "docs/LIVE_DEPLOYMENT.md is missing expected value: $value"
  }
}

if (
  $writtenReadme.IndexOf(
    $githubDisplayValue,
    [System.StringComparison]::Ordinal
  ) -lt 0
) {
  throw "README.md does not contain the GitHub repository URL after update."
}

if (
  $writtenReadme.IndexOf(
    $hostingUrl,
    [System.StringComparison]::Ordinal
  ) -lt 0
) {
  throw "README.md does not contain the live Hosting URL after update."
}

if (
  $writtenReadme.IndexOf(
    $apiUrl,
    [System.StringComparison]::Ordinal
  ) -lt 0
) {
  throw "README.md does not contain the live API URL after update."
}

# Ensure exactly one live-deployment marker pair remains.
$startMarkerCount = (
  [regex]::Matches(
    $writtenReadme,
    [regex]::Escape($startMarker)
  )
).Count

$endMarkerCount = (
  [regex]::Matches(
    $writtenReadme,
    [regex]::Escape($endMarker)
  )
).Count

if (
  $startMarkerCount -ne 1 -or
  $endMarkerCount -ne 1
) {
  throw "README.md contains duplicate or missing Phase IV live-deployment markers."
}

# Ensure PENDING values were removed from the live block.
$updatedStartIndex = $writtenReadme.IndexOf(
  $startMarker,
  [System.StringComparison]::Ordinal
)

$updatedEndIndex = $writtenReadme.IndexOf(
  $endMarker,
  [System.StringComparison]::Ordinal
)

$liveBlockLength = `
  ($updatedEndIndex + $endMarker.Length) -
  $updatedStartIndex

$liveBlock = $writtenReadme.Substring(
  $updatedStartIndex,
  $liveBlockLength
)

if ($liveBlock -match '\bPENDING\b') {
  throw "README live-deployment block still contains PENDING."
}

# -------------------------------------------------------------------
# Record documentation state
# -------------------------------------------------------------------

$state = Get-Phase4State

$state["liveDocumentationRecorded"] = $true
$state["liveDocumentationRecordedAtUtc"] = [DateTime]::UtcNow.ToString("o")
$state["githubRepoUrl"] = $githubDisplayValue
$state["githubRepoRecorded"] = $true

Save-Phase4State $state

# -------------------------------------------------------------------
# Final result
# -------------------------------------------------------------------

Write-Host ""
Write-Host "Live deployment documentation updated." -ForegroundColor Green
Write-Host ""
Write-Host "README:              $readmePath"
Write-Host "Deployment record:   $recordPath"
Write-Host "GitHub repository:   $githubDisplayValue"
Write-Host "Live application:    $hostingUrl"
Write-Host "API:                 $apiUrl"
Write-Host "Smoke test:          PASS"
Write-Host "Verified at UTC:     $verifiedAt"