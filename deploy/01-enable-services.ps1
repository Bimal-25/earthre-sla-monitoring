. (Join-Path $PSScriptRoot "common.ps1")

$config = Import-Phase4Config

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
# Enable required Google Cloud APIs
# -------------------------------------------------------------------

Write-Step "Enabling required Google Cloud APIs"

# Cloud Run source/function deployment requires:
#   - Cloud Run Admin API
#   - Cloud Build API
#   - Artifact Registry API
#   - Cloud Logging API
#
# The EarthRe application additionally requires:
#   - Firestore API
#   - IAM API for service-account management
#   - Firebase APIs used by Firebase project/Hosting tooling

$services = @(
  "run.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "logging.googleapis.com",
  "firestore.googleapis.com",
  "iam.googleapis.com",
  "firebase.googleapis.com",
  "firebasehosting.googleapis.com"
)

Invoke-External "gcloud" (
  @(
    "services",
    "enable"
  ) +
  $services +
  @(
    "--project=$($config.ProjectId)",
    "--quiet"
  )
)

# -------------------------------------------------------------------
# Verify required APIs
# -------------------------------------------------------------------

Write-Step "Verifying required APIs"

$enabledServicesText = Invoke-ExternalCapture "gcloud" @(
  "services",
  "list",
  "--enabled",
  "--project=$($config.ProjectId)",
  "--format=value(config.name)"
)

$enabledServices = @(
  $enabledServicesText -split "\r?\n" |
    ForEach-Object { $_.Trim() } |
    Where-Object {
      -not [string]::IsNullOrWhiteSpace($_)
    }
)

$missingServices = @()

foreach ($service in $services) {
  if ($enabledServices -notcontains $service) {
    $missingServices += $service
  }
}

if ($missingServices.Count -gt 0) {
  throw @"
One or more required Google Cloud APIs were not enabled successfully:

$($missingServices -join "`n")

Wait briefly and rerun this script. If the problem persists, inspect the
Google Cloud Service Usage page for project '$($config.ProjectId)'.
"@
}

Write-Host "Required APIs are enabled."

foreach ($service in $services) {
  Write-Host "  [enabled] $service"
}

# -------------------------------------------------------------------
# Runtime service account
# -------------------------------------------------------------------

$serviceAccountEmail = Get-RuntimeServiceAccountEmail `
  $config.RuntimeServiceAccountName `
  $config.ProjectId

Write-Step "Ensuring dedicated runtime service account exists"

$runtimeServiceAccountExists = $false

try {
  $existingRuntimeAccount = Invoke-ExternalCapture "gcloud" @(
    "iam",
    "service-accounts",
    "describe",
    $serviceAccountEmail,
    "--project=$($config.ProjectId)",
    "--format=value(email)"
  )

  if (
    -not [string]::IsNullOrWhiteSpace(
      [string]$existingRuntimeAccount
    )
  ) {
    $runtimeServiceAccountExists = $true
  }
}
catch {
  $runtimeServiceAccountExists = $false
}

if (-not $runtimeServiceAccountExists) {
  Write-Host "Creating runtime service account: $serviceAccountEmail"

  Invoke-External "gcloud" @(
    "iam",
    "service-accounts",
    "create",
    $config.RuntimeServiceAccountName,
    "--display-name=EarthRe SLA API runtime",
    "--description=Runtime identity for the EarthRe SLA monitoring API",
    "--project=$($config.ProjectId)",
    "--quiet"
  )

  # Verify that creation succeeded.
  $createdRuntimeAccount = Invoke-ExternalCapture "gcloud" @(
    "iam",
    "service-accounts",
    "describe",
    $serviceAccountEmail,
    "--project=$($config.ProjectId)",
    "--format=value(email)"
  )

  if (
    [string]::IsNullOrWhiteSpace(
      [string]$createdRuntimeAccount
    )
  ) {
    throw "Runtime service account was created but could not be verified: $serviceAccountEmail"
  }

  Write-Host "Runtime service account created."
}
else {
  Write-Host "Runtime service account already exists: $serviceAccountEmail"
}

# -------------------------------------------------------------------
# Runtime Firestore permission
# -------------------------------------------------------------------

Write-Step "Granting Firestore access to the runtime service account"

Invoke-External "gcloud" @(
  "projects",
  "add-iam-policy-binding",
  $config.ProjectId,
  "--member=serviceAccount:$serviceAccountEmail",
  "--role=roles/datastore.user",
  "--condition=None",
  "--quiet"
)

Write-Host "Runtime role granted: roles/datastore.user"

# -------------------------------------------------------------------
# Cloud Build identity
#
# Cloud Run source deployments use Cloud Build. Google Cloud projects
# created under the current Cloud Build model normally use the Compute
# Engine default service account, but we ask Cloud Build directly
# instead of assuming which default identity is configured.
# -------------------------------------------------------------------

Write-Step "Resolving Cloud Build default service account"

$buildServiceAccountRaw = $null

try {
  $buildServiceAccountRaw = (
    Invoke-ExternalCapture "gcloud" @(
      "builds",
      "get-default-service-account",
      "--project=$($config.ProjectId)",
      "--format=value(serviceAccountEmail)"
    )
  ).Trim()
}
catch {
  throw @"
Cloud Build is enabled, but its default build service account could not
be determined.

Run manually:

  gcloud builds get-default-service-account --project=$($config.ProjectId)

Then rerun this script.
"@
}

if ([string]::IsNullOrWhiteSpace($buildServiceAccountRaw)) {
  throw "Cloud Build returned an empty default service-account value."
}

# Depending on the gcloud/API representation this can be returned as
# either a plain email address or as:
#
# projects/PROJECT_ID/serviceAccounts/EMAIL
#
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

# -------------------------------------------------------------------
# Cloud Run source-build permission
# -------------------------------------------------------------------

Write-Step "Granting Cloud Run Builder role to Cloud Build identity"

Invoke-External "gcloud" @(
  "projects",
  "add-iam-policy-binding",
  $config.ProjectId,
  "--member=serviceAccount:$buildServiceAccountEmail",
  "--role=roles/run.builder",
  "--condition=None",
  "--quiet"
)

Write-Host "Build role granted: roles/run.builder"

# -------------------------------------------------------------------
# Save Phase IV deployment state
# -------------------------------------------------------------------

Write-Step "Recording Phase IV deployment state"

$state = Get-Phase4State

$state["projectId"] = $config.ProjectId
$state["region"] = $config.Region
$state["firestoreLocation"] = $config.FirestoreLocation
$state["apiServiceName"] = $config.ApiServiceName
$state["runtimeServiceAccount"] = $serviceAccountEmail
$state["cloudBuildServiceAccount"] = $buildServiceAccountEmail
$state["hostingUrl"] = Get-HostingUrl $config.ProjectId
$state["hostingAlternateUrl"] = Get-HostingAlternateUrl $config.ProjectId

Save-Phase4State $state

# -------------------------------------------------------------------
# Final result
# -------------------------------------------------------------------

Write-Host ""
Write-Host "Required services and runtime identity are ready." -ForegroundColor Green
Write-Host ""
Write-Host "Project:                     $($config.ProjectId)"
Write-Host "Runtime service account:     $serviceAccountEmail"
Write-Host "Runtime Firestore role:      roles/datastore.user"
Write-Host "Cloud Build account:         $buildServiceAccountEmail"
Write-Host "Cloud Build role:            roles/run.builder"
Write-Host "Enabled API count:           $($services.Count)"
Write-Host ""
Write-Host "No Firestore database, Cloud Run service, or Hosting site was deployed by this step."