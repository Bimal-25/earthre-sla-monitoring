. (Join-Path $PSScriptRoot "common.ps1")

$config = Import-Phase4Config

# -------------------------------------------------------------------
# Derived deployment values
# -------------------------------------------------------------------

$serviceAccountEmail = Get-RuntimeServiceAccountEmail `
  $config.RuntimeServiceAccountName `
  $config.ProjectId

$hostingUrl = Get-HostingUrl $config.ProjectId
$hostingAlternateUrl = Get-HostingAlternateUrl $config.ProjectId

$runtimeEnvPath = Join-Path `
  $PSScriptRoot `
  ".runtime-env.yaml"

# -------------------------------------------------------------------
# Select Google Cloud project
# -------------------------------------------------------------------

Write-Step "Setting active Google Cloud project"

Invoke-External "gcloud" @(
  "config",
  "set",
  "project",
  $config.ProjectId
)

# -------------------------------------------------------------------
# Verify deployment prerequisites
# -------------------------------------------------------------------

Write-Step "Checking backend deployment prerequisites"

$requiredBackendFiles = @(
  "package.json",
  "package-lock.json",
  "server/index.cjs",
  ".gcloudignore"
)

foreach ($relativePath in $requiredBackendFiles) {
  $fullPath = Join-Path `
    $script:RepoRoot `
    $relativePath

  if (-not (Test-Path $fullPath)) {
    throw "Required backend deployment file is missing: $relativePath"
  }
}

Write-Host "Backend source deployment files are present."

# Verify the runtime service account still exists.
$runtimeAccountResult = Invoke-ExternalCapture "gcloud" @(
  "iam",
  "service-accounts",
  "describe",
  $serviceAccountEmail,
  "--project=$($config.ProjectId)",
  "--format=value(email)"
)

if (
  [string]::IsNullOrWhiteSpace(
    [string]$runtimeAccountResult
  )
) {
  throw "Runtime service account does not exist: $serviceAccountEmail"
}

Write-Host "Runtime service account verified: $serviceAccountEmail"

# -------------------------------------------------------------------
# Resolve the Cloud Build service account
#
# Step 01 already granted roles/run.builder to this identity.
# Resolve it again so this script remains safe when run independently.
# -------------------------------------------------------------------

Write-Step "Resolving Cloud Build service account"

$buildServiceAccountRaw = (
  Invoke-ExternalCapture "gcloud" @(
    "builds",
    "get-default-service-account",
    "--project=$($config.ProjectId)",
    "--format=value(serviceAccountEmail)"
  )
).Trim()

if ([string]::IsNullOrWhiteSpace($buildServiceAccountRaw)) {
  throw "Cloud Build returned an empty default service-account value."
}

$buildServiceAccountEmail = $buildServiceAccountRaw

if (
  $buildServiceAccountEmail -match
    '/serviceAccounts/([^/]+)$'
) {
  $buildServiceAccountEmail = $Matches[1]
}

$buildServiceAccountEmail = $buildServiceAccountEmail.Trim()

if (
  [string]::IsNullOrWhiteSpace($buildServiceAccountEmail) -or
  $buildServiceAccountEmail -notmatch '@'
) {
  throw "Unexpected Cloud Build service-account value: '$buildServiceAccountRaw'"
}

Write-Host "Cloud Build service account: $buildServiceAccountEmail"

$buildServiceAccountResource = `
  "projects/$($config.ProjectId)/serviceAccounts/$buildServiceAccountEmail"

# -------------------------------------------------------------------
# Verify Firestore before deploying an API that depends on it
# -------------------------------------------------------------------

Write-Step "Verifying Firestore dependency"

$firestoreJson = Invoke-ExternalCapture "gcloud" @(
  "firestore",
  "databases",
  "describe",
  "--database=(default)",
  "--project=$($config.ProjectId)",
  "--format=json"
)

if ([string]::IsNullOrWhiteSpace($firestoreJson)) {
  throw "Default Firestore database could not be verified."
}

try {
  $firestoreDatabase = $firestoreJson | ConvertFrom-Json
}
catch {
  throw "Firestore database information could not be parsed as JSON."
}

$actualFirestoreLocation = [string]$firestoreDatabase.locationId

if ($actualFirestoreLocation -ne $config.FirestoreLocation) {
  throw @"
Firestore location mismatch.

Configured:
  $($config.FirestoreLocation)

Actual:
  $actualFirestoreLocation

Stop deployment and review the region configuration.
"@
}

if (
  [string]$firestoreDatabase.type -ne
    "FIRESTORE_NATIVE"
) {
  throw "Expected Firestore Native mode. Found '$($firestoreDatabase.type)'."
}

Write-Host "Firestore verified: (default) / $actualFirestoreLocation / FIRESTORE_NATIVE"

# -------------------------------------------------------------------
# Final backend quality gate
# -------------------------------------------------------------------

Write-Step "Running the final backend quality gate before deployment"

Push-Location $script:RepoRoot

try {
  Invoke-External "npm" @(
    "ci"
  )

  Invoke-External "npm" @(
    "run",
    "check"
  )

  # -----------------------------------------------------------------
  # Runtime environment configuration
  # -----------------------------------------------------------------

  Write-Step "Writing temporary Cloud Run runtime environment configuration"

  $runtimeEnvText = @"
ALLOWED_ORIGIN: "$hostingUrl,$hostingAlternateUrl"
MAX_UPLOAD_BYTES: "$($config.MaxUploadBytes)"
MAX_CSV_ROWS: "$($config.MaxCsvRows)"
DEFAULT_PAGE_SIZE: "$($config.DefaultPageSize)"
MAX_PAGE_SIZE: "$($config.MaxPageSize)"
SLA_TARGET_PERCENT: "$($config.SlaTargetPercent)"
"@

  # Windows PowerShell 5.1's Set-Content -Encoding UTF8 writes a BOM.
  # Write UTF-8 without BOM to keep the YAML file predictable.
  $utf8WithoutBom = New-Object `
    System.Text.UTF8Encoding($false)

  [System.IO.File]::WriteAllText(
    $runtimeEnvPath,
    $runtimeEnvText,
    $utf8WithoutBom
  )

  if (-not (Test-Path $runtimeEnvPath)) {
    throw "Temporary runtime environment file was not created."
  }

  # -----------------------------------------------------------------
  # Deploy Cloud Run function-style service
  # -----------------------------------------------------------------

  Write-Step "Deploying public Node.js 22 Cloud Run function-style API"

  Write-Host "Service:               $($config.ApiServiceName)"
  Write-Host "Region:                $($config.Region)"
  Write-Host "Runtime:               Node.js 22"
  Write-Host "Function entry point:  api"
  Write-Host "Runtime identity:      $serviceAccountEmail"
  Write-Host "Build identity:        $buildServiceAccountEmail"
  Write-Host "Minimum instances:     $($config.MinInstances)"
  Write-Host "Maximum instances:     $($config.MaxInstances)"
  Write-Host "CPU:                   $($config.Cpu)"
  Write-Host "Memory:                $($config.Memory)"
  Write-Host "Concurrency:           $($config.Concurrency)"
  Write-Host "Timeout:               $($config.Timeout)"

  Invoke-External "gcloud" @(
    "run",
    "deploy",
    $config.ApiServiceName,

    "--source",
    ".",

    "--function",
    "api",

    "--base-image",
    "nodejs22",

    "--build-service-account",
    $buildServiceAccountResource,

    "--region",
    $config.Region,

    "--project",
    $config.ProjectId,

    "--allow-unauthenticated",

    "--service-account",
    $serviceAccountEmail,

    "--cpu",
    $config.Cpu,

    "--memory",
    $config.Memory,

    "--concurrency",
    [string]$config.Concurrency,

    "--timeout",
    $config.Timeout,

    "--min-instances",
    [string]$config.MinInstances,

    "--max-instances",
    [string]$config.MaxInstances,

    "--env-vars-file",
    $runtimeEnvPath,

    "--quiet"
  )
}
finally {
  Pop-Location

  Remove-Item `
    -Force `
    $runtimeEnvPath `
    -ErrorAction SilentlyContinue
}

# -------------------------------------------------------------------
# Resolve deployed API URL
# -------------------------------------------------------------------

Write-Step "Resolving deployed API URL"

$apiUrl = (
  Invoke-ExternalCapture "gcloud" @(
    "run",
    "services",
    "describe",
    $config.ApiServiceName,
    "--region=$($config.Region)",
    "--project=$($config.ProjectId)",
    "--format=value(status.url)"
  )
).Trim()

if ([string]::IsNullOrWhiteSpace($apiUrl)) {
  throw "Cloud Run deployed, but its public URL could not be resolved."
}

if ($apiUrl -notmatch '^https://') {
  throw "Unexpected Cloud Run service URL: '$apiUrl'"
}

Write-Host "API URL: $apiUrl"

# -------------------------------------------------------------------
# Verify deployed runtime identity
# -------------------------------------------------------------------

Write-Step "Verifying deployed runtime service identity"

$deployedServiceAccount = (
  Invoke-ExternalCapture "gcloud" @(
    "run",
    "services",
    "describe",
    $config.ApiServiceName,
    "--region=$($config.Region)",
    "--project=$($config.ProjectId)",
    "--format=value(spec.template.spec.serviceAccountName)"
  )
).Trim()

if (
  $deployedServiceAccount -ne
  $serviceAccountEmail
) {
  throw @"
Cloud Run runtime identity verification failed.

Expected:
  $serviceAccountEmail

Actual:
  $deployedServiceAccount
"@
}

Write-Host "Runtime identity verified: $deployedServiceAccount"

# -------------------------------------------------------------------
# Verify live health endpoint and CORS
#
# Use a few attempts so a first cold start or brief post-deployment
# propagation delay does not incorrectly fail the deployment.
# -------------------------------------------------------------------

Write-Step "Verifying live health endpoint and production CORS origin"

$healthUrl = "$apiUrl/v1/health"

$healthResponse = $null
$healthError = $null

$maxHealthAttempts = 6
$healthAttempt = 1

while (
  $healthAttempt -le $maxHealthAttempts -and
  $null -eq $healthResponse
) {
  try {
    Write-Host "Health check attempt $healthAttempt of $maxHealthAttempts..."

    $healthResponse = Invoke-WebRequest `
      -Uri $healthUrl `
      -Headers @{
        Origin = $hostingUrl
      } `
      -UseBasicParsing `
      -TimeoutSec 30
  }
  catch {
    $healthError = $_

    if ($healthAttempt -lt $maxHealthAttempts) {
      Start-Sleep -Seconds 5
    }
  }

  $healthAttempt++
}

if ($null -eq $healthResponse) {
  throw @"
Cloud Run deployed, but the health endpoint could not be reached.

URL:
  $healthUrl

Last error:
  $healthError
"@
}

if ($healthResponse.StatusCode -ne 200) {
  throw "Health endpoint returned HTTP $($healthResponse.StatusCode)."
}

try {
  $health = $healthResponse.Content |
    ConvertFrom-Json
}
catch {
  throw "Health endpoint returned HTTP 200 but the response was not valid JSON."
}

if ($health.status -ne "ok") {
  throw "Health endpoint response did not report status=ok."
}

$allowedOrigin = [string](
  $healthResponse.Headers[
    "Access-Control-Allow-Origin"
  ]
)

if ($allowedOrigin -ne $hostingUrl) {
  throw @"
CORS verification failed.

Expected Access-Control-Allow-Origin:
  $hostingUrl

Received:
  $allowedOrigin
"@
}

Write-Host "Health endpoint verified: HTTP 200 / status=ok"
Write-Host "Production CORS origin verified: $allowedOrigin"

# -------------------------------------------------------------------
# Record deployment state
# -------------------------------------------------------------------

Write-Step "Recording API deployment state"

$state = Get-Phase4State

$state["projectId"] = $config.ProjectId
$state["region"] = $config.Region
$state["apiServiceName"] = $config.ApiServiceName
$state["apiUrl"] = $apiUrl
$state["apiHealthVerified"] = $true
$state["runtimeServiceAccount"] = $serviceAccountEmail
$state["cloudBuildServiceAccount"] = $buildServiceAccountEmail
$state["hostingUrl"] = $hostingUrl
$state["hostingAlternateUrl"] = $hostingAlternateUrl
$state["firestoreLocation"] = $actualFirestoreLocation

Save-Phase4State $state

# -------------------------------------------------------------------
# Final result
# -------------------------------------------------------------------

Write-Host ""
Write-Host "API deployment passed." -ForegroundColor Green
Write-Host ""
Write-Host "Project:          $($config.ProjectId)"
Write-Host "Region:           $($config.Region)"
Write-Host "Service:          $($config.ApiServiceName)"
Write-Host "Runtime:          Node.js 22"
Write-Host "Runtime identity: $serviceAccountEmail"
Write-Host "API URL:          $apiUrl"
Write-Host "Health URL:       $healthUrl"
Write-Host "Health:           verified"
Write-Host "CORS:             verified for $hostingUrl"
Write-Host ""
Write-Host "The frontend has not been deployed yet."