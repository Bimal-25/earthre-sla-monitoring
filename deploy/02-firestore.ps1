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
# Inspect existing Firestore databases
#
# Use LIST rather than treating a failed DESCRIBE as proof that the
# database does not exist. If listing fails, the script stops safely.
# -------------------------------------------------------------------

Write-Step "Checking Firestore databases"

$databaseListJson = Invoke-ExternalCapture "gcloud" @(
  "firestore",
  "databases",
  "list",
  "--project=$($config.ProjectId)",
  "--format=json"
)

$databases = @()

if (
  -not [string]::IsNullOrWhiteSpace(
    [string]$databaseListJson
  )
) {
  try {
    $parsedDatabases = $databaseListJson | ConvertFrom-Json

    if ($null -ne $parsedDatabases) {
      $databases = @($parsedDatabases)
    }
  }
  catch {
    throw "Google Cloud returned a Firestore database list that could not be parsed as JSON."
  }
}

$defaultDatabase = $databases |
  Where-Object {
    $databaseName = [string]$_.name

    (
      $databaseName -eq "(default)"
    ) -or (
      $databaseName -match '/databases/\(default\)$'
    ) -or (
      $_.PSObject.Properties.Name -contains "databaseId" -and
      [string]$_.databaseId -eq "(default)"
    )
  } |
  Select-Object -First 1

# -------------------------------------------------------------------
# Create the default Firestore database when absent
# -------------------------------------------------------------------

if ($null -eq $defaultDatabase) {
  Write-Host ""
  Write-Warning "The default Firestore database does not exist."
  Write-Warning "Its location cannot be changed after provisioning."
  Write-Host ""
  Write-Host "Project:            $($config.ProjectId)"
  Write-Host "Database:           (default)"
  Write-Host "Edition:            Standard"
  Write-Host "Mode:               Firestore Native"
  Write-Host "Permanent location: $($config.FirestoreLocation)"
  Write-Host ""

  $confirmation = Read-Host "Type CREATE to provision this Firestore database"

  if ($confirmation -cne "CREATE") {
    throw "Firestore creation cancelled. No database was created."
  }

  Write-Step "Creating the default Firestore database"

  Invoke-External "gcloud" @(
    "firestore",
    "databases",
    "create",
    "--database=(default)",
    "--location=$($config.FirestoreLocation)",
    "--edition=standard",
    "--type=firestore-native",
    "--project=$($config.ProjectId)",
    "--quiet"
  )

  Write-Host "Firestore database creation completed."
}
else {
  Write-Host "Default Firestore database already exists."
}

# -------------------------------------------------------------------
# Read and verify the actual database configuration
# -------------------------------------------------------------------

Write-Step "Verifying Firestore database configuration"

$databaseJson = Invoke-ExternalCapture "gcloud" @(
  "firestore",
  "databases",
  "describe",
  "--database=(default)",
  "--project=$($config.ProjectId)",
  "--format=json"
)

if ([string]::IsNullOrWhiteSpace($databaseJson)) {
  throw "Firestore database describe returned an empty response."
}

try {
  $database = $databaseJson | ConvertFrom-Json
}
catch {
  throw "Firestore database information could not be parsed as JSON."
}

if ($null -eq $database) {
  throw "Firestore database could not be verified after provisioning."
}

$actualLocation = [string]$database.locationId

if ([string]::IsNullOrWhiteSpace($actualLocation)) {
  throw "Firestore database did not report a locationId."
}

if ($actualLocation -ne $config.FirestoreLocation) {
  throw @"
Firestore location mismatch.

Configured location:
  $($config.FirestoreLocation)

Actual database location:
  $actualLocation

Firestore database locations cannot be changed in place.

Do not continue with deployment until deploy/phase4.config.ps1 is updated
to reflect the actual database location and the API region decision has
been reviewed.
"@
}

# Validate type when the API returns it.
if (
  $database.PSObject.Properties.Name -contains "type" -and
  -not [string]::IsNullOrWhiteSpace(
    [string]$database.type
  )
) {
  $actualType = [string]$database.type

  if (
    $actualType -notmatch
      'FIRESTORE_NATIVE|firestore-native'
  ) {
    throw "Unexpected Firestore database type: '$actualType'. Expected Firestore Native mode."
  }
}

# Validate edition when the API returns it.
if (
  $database.PSObject.Properties.Name -contains "edition" -and
  -not [string]::IsNullOrWhiteSpace(
    [string]$database.edition
  )
) {
  $actualEdition = [string]$database.edition

  if (
    $actualEdition -notmatch
      'STANDARD|standard'
  ) {
    throw "Unexpected Firestore edition: '$actualEdition'. Expected Standard edition."
  }
}

Write-Host "Firestore database verified."
Write-Host "  Database: (default)"
Write-Host "  Location: $actualLocation"

if (
  $database.PSObject.Properties.Name -contains "type"
) {
  Write-Host "  Type:     $($database.type)"
}

if (
  $database.PSObject.Properties.Name -contains "edition"
) {
  Write-Host "  Edition:  $($database.edition)"
}

# -------------------------------------------------------------------
# Confirm local Firestore configuration exists
# -------------------------------------------------------------------

Write-Step "Checking Firestore deployment files"

$firestoreRulesPath = Join-Path `
  $script:RepoRoot `
  "firestore.rules"

$firestoreIndexesPath = Join-Path `
  $script:RepoRoot `
  "firestore.indexes.json"

$firebaseConfigPath = Join-Path `
  $script:RepoRoot `
  "firebase.json"

if (-not (Test-Path $firestoreRulesPath)) {
  throw "Missing firestore.rules."
}

if (-not (Test-Path $firestoreIndexesPath)) {
  throw "Missing firestore.indexes.json."
}

if (-not (Test-Path $firebaseConfigPath)) {
  throw "Missing firebase.json."
}

Write-Host "Firestore deployment files are present."

# -------------------------------------------------------------------
# Deploy Security Rules and composite indexes
#
# `firebase deploy --only firestore` deploys the configured Firestore
# rules and indexes without deploying Hosting or any other Firebase
# resource.
# -------------------------------------------------------------------

Write-Step "Deploying Firestore Security Rules and indexes"

Push-Location $script:RepoRoot

try {
  Invoke-External "firebase" @(
    "deploy",
    "--only",
    "firestore",
    "--project",
    $config.ProjectId,
    "--non-interactive"
  )
}
finally {
  Pop-Location
}

# -------------------------------------------------------------------
# Record deployment state
# -------------------------------------------------------------------

Write-Step "Recording Firestore deployment state"

$state = Get-Phase4State

$state["firestoreDeployed"] = $true
$state["firestoreDatabase"] = "(default)"
$state["firestoreLocation"] = $actualLocation

if (
  $database.PSObject.Properties.Name -contains "edition"
) {
  $state["firestoreEdition"] = [string]$database.edition
}

if (
  $database.PSObject.Properties.Name -contains "type"
) {
  $state["firestoreType"] = [string]$database.type
}

Save-Phase4State $state

# -------------------------------------------------------------------
# Final result
# -------------------------------------------------------------------

Write-Host ""
Write-Host "Firestore is ready." -ForegroundColor Green
Write-Host ""
Write-Host "Project:       $($config.ProjectId)"
Write-Host "Database:      (default)"
Write-Host "Location:      $actualLocation"
Write-Host "Rules:         deployed"
Write-Host "Indexes:       submitted"
Write-Host ""
Write-Host "Composite indexes can require time to finish building before every indexed query is available."
Write-Host "No Cloud Run service or Firebase Hosting site was deployed by this step."