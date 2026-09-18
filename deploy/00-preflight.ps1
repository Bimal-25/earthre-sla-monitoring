. (Join-Path $PSScriptRoot "common.ps1")

$config = Import-Phase4Config

# -------------------------------------------------------------------
# Required command-line tools
# -------------------------------------------------------------------

Write-Step "Checking required command-line tools"

Assert-Command "node"
Assert-Command "npm"
Assert-Command "gcloud"
Assert-Command "firebase"

$nodeVersion = (
  Invoke-ExternalCapture "node" @(
    "--version"
  )
).Trim()

if ($nodeVersion -notmatch '^v22\.') {
  throw "Node.js 22.x is required. Found $nodeVersion."
}

$npmVersion = (
  Invoke-ExternalCapture "npm" @(
    "--version"
  )
).Trim()

$firebaseVersion = (
  Invoke-ExternalCapture "firebase" @(
    "--version"
  )
).Trim()

Write-Host "Node.js:      $nodeVersion"
Write-Host "npm:          $npmVersion"
Write-Host "Firebase CLI: $firebaseVersion"

# -------------------------------------------------------------------
# Google Cloud authentication
# -------------------------------------------------------------------

Write-Step "Checking Google Cloud authentication"

$activeAccountsText = Invoke-ExternalCapture "gcloud" @(
  "auth",
  "list",
  "--filter=status:ACTIVE",
  "--format=value(account)"
)

$activeAccount = (
  $activeAccountsText -split "\r?\n" |
    Where-Object {
      -not [string]::IsNullOrWhiteSpace($_)
    } |
    Select-Object -First 1
)

if ([string]::IsNullOrWhiteSpace($activeAccount)) {
  throw @"
No active Google Cloud CLI account was found.

Run:

  gcloud auth login

Then rerun this preflight.
"@
}

Write-Host "Active gcloud account: $activeAccount"

# -------------------------------------------------------------------
# Select / verify Google Cloud project
# -------------------------------------------------------------------

Write-Step "Selecting Google Cloud project"

Invoke-External "gcloud" @(
  "config",
  "set",
  "project",
  $config.ProjectId
)

$projectAccessible = $false
$projectJson = $null

try {
  $projectJson = Invoke-ExternalCapture "gcloud" @(
    "projects",
    "describe",
    $config.ProjectId,
    "--format=json"
  )

  $projectAccessible = $true
}
catch {
  $projectAccessible = $false
}

if (-not $projectAccessible) {
  if (-not $config.CreateProjectIfMissing) {
    throw @"
Google Cloud project '$($config.ProjectId)' does not exist or is not accessible.

The current Phase IV configuration intentionally has:

  CreateProjectIfMissing = `$false

Verify that:

  1. The project ID is correct.
  2. The active gcloud account has access.
  3. The project exists in Firebase / Google Cloud.

Then rerun this preflight.
"@
  }

  Write-Step "Creating Google Cloud project $($config.ProjectId)"

  Invoke-External "gcloud" @(
    "projects",
    "create",
    $config.ProjectId,
    "--name=$($config.ProjectDisplayName)"
  )

  Invoke-External "gcloud" @(
    "config",
    "set",
    "project",
    $config.ProjectId
  )

  # Verify that the newly created project is now accessible.
  $projectJson = Invoke-ExternalCapture "gcloud" @(
    "projects",
    "describe",
    $config.ProjectId,
    "--format=json"
  )
}
else {
  Write-Host "Google Cloud project is accessible."
}

$projectInfo = $null

try {
  $projectInfo = $projectJson | ConvertFrom-Json
}
catch {
  throw "Google Cloud returned project information that could not be parsed as JSON."
}

if ($null -ne $projectInfo) {
  if ($null -ne $projectInfo.projectId) {
    Write-Host "Google Cloud project ID: $($projectInfo.projectId)"
  }

  if ($null -ne $projectInfo.projectNumber) {
    Write-Host "Google Cloud project number: $($projectInfo.projectNumber)"
  }
}

# -------------------------------------------------------------------
# Firebase authentication / project registration
# -------------------------------------------------------------------

Write-Step "Checking Firebase CLI authentication and project registration"

$firebaseJsonText = Invoke-ExternalCapture "firebase" @(
  "projects:list",
  "--json"
)

if ([string]::IsNullOrWhiteSpace($firebaseJsonText)) {
  throw @"
Firebase CLI returned an empty project-list response.

Verify Firebase authentication with:

  firebase.cmd login
  firebase.cmd projects:list
"@
}

$firebaseResponse = $null

try {
  $firebaseResponse = $firebaseJsonText | ConvertFrom-Json
}
catch {
  throw @"
Firebase CLI returned output that could not be parsed as JSON.

Run this manually to inspect the response:

  firebase.cmd projects:list --json
"@
}

$firebaseProjects = @()

if ($null -ne $firebaseResponse) {
  $topLevelProperties = @(
    $firebaseResponse.PSObject.Properties.Name
  )

  if ($topLevelProperties -contains "result") {
    $result = $firebaseResponse.result

    if ($null -ne $result) {
      $resultProperties = @(
        $result.PSObject.Properties.Name
      )

      if ($resultProperties -contains "projects") {
        $firebaseProjects = @($result.projects)
      }
      else {
        $firebaseProjects = @($result)
      }
    }
  }
  elseif ($topLevelProperties -contains "projects") {
    $firebaseProjects = @($firebaseResponse.projects)
  }
  elseif ($firebaseResponse -is [System.Array]) {
    $firebaseProjects = @($firebaseResponse)
  }
  else {
    $firebaseProjects = @($firebaseResponse)
  }
}

$firebaseProject = $firebaseProjects |
  Where-Object {
    $null -ne $_ -and
    $_.projectId -eq $config.ProjectId
  } |
  Select-Object -First 1

if ($null -eq $firebaseProject) {
  throw @"
Google Cloud project '$($config.ProjectId)' was not found in the Firebase projects available to this account.

Your Firebase CLI account may be different from the Google Cloud CLI account,
or the Google Cloud project may not yet be Firebase-enabled.

Verify manually:

  firebase.cmd projects:list

If the project is missing, enable Firebase for it with:

  firebase.cmd projects:addfirebase $($config.ProjectId)

Then rerun this preflight.
"@
}

Write-Host "Firebase project found: $($config.ProjectId)"

if (
  $firebaseProject.PSObject.Properties.Name -contains "projectNumber" -and
  -not [string]::IsNullOrWhiteSpace(
    [string]$firebaseProject.projectNumber
  )
) {
  Write-Host "Firebase project number: $($firebaseProject.projectNumber)"
}

# -------------------------------------------------------------------
# Local repository configuration
# -------------------------------------------------------------------

Write-Step "Checking local repository configuration"

$requiredFiles = @(
  "package.json",
  "package-lock.json",
  "server/index.cjs",
  "firebase.json",
  "firestore.rules",
  "firestore.indexes.json",
  "web/package.json",
  "web/package-lock.json"
)

foreach ($relative in $requiredFiles) {
  $path = Join-Path $script:RepoRoot $relative

  if (-not (Test-Path $path)) {
    throw "Required project file is missing: $relative"
  }
}

Write-Host "Required repository files are present."

# -------------------------------------------------------------------
# Configuration summary
# -------------------------------------------------------------------

Write-Step "Deployment configuration summary"

$hostingUrl = Get-HostingUrl $config.ProjectId
$hostingAlternateUrl = Get-HostingAlternateUrl $config.ProjectId

Write-Host "Project:                     $($config.ProjectId)"
Write-Host "API region:                  $($config.Region)"
Write-Host "Firestore location:          $($config.FirestoreLocation)"
Write-Host "API service:                 $($config.ApiServiceName)"
Write-Host "Runtime service account:     $($config.RuntimeServiceAccountName)"
Write-Host "Minimum instances:           $($config.MinInstances)"
Write-Host "Maximum instances:           $($config.MaxInstances)"
Write-Host "Concurrency:                 $($config.Concurrency)"
Write-Host "Memory:                      $($config.Memory)"
Write-Host "Timeout:                     $($config.Timeout)"
Write-Host "Expected Hosting URL:        $hostingUrl"
Write-Host "Alternate Hosting URL:       $hostingAlternateUrl"

# -------------------------------------------------------------------
# Final result
# -------------------------------------------------------------------

Write-Host ""
Write-Host "Preflight passed." -ForegroundColor Green
Write-Host ""
Write-Host "No cloud resources were created or deployed by this preflight."