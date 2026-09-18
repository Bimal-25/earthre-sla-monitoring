. (Join-Path $PSScriptRoot "common.ps1")

$config = Import-Phase4Config
$state = Get-Phase4State

$hostingUrl = Get-HostingUrl $config.ProjectId
$hostingAlternateUrl = Get-HostingAlternateUrl $config.ProjectId

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
# Resolve the live API URL
# -------------------------------------------------------------------

Write-Step "Resolving live API URL"

$apiUrl = $null

if ($state.ContainsKey("apiUrl")) {
  $apiUrl = [string]$state["apiUrl"]
}

if ([string]::IsNullOrWhiteSpace($apiUrl)) {
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
}

if ([string]::IsNullOrWhiteSpace($apiUrl)) {
  throw @"
API URL is unavailable.

Deploy and verify the API first:

  .\deploy\03-deploy-api.ps1
"@
}

if ($apiUrl -notmatch '^https://') {
  throw "Unexpected API URL: '$apiUrl'"
}

# Remove an accidental trailing slash so VITE_API_BASE_URL stays
# consistent with the frontend API client configuration.
$apiUrl = $apiUrl.TrimEnd("/")

Write-Host "API URL: $apiUrl"

# -------------------------------------------------------------------
# Verify the API is still healthy before building the frontend
# -------------------------------------------------------------------

Write-Step "Verifying live API before frontend build"

$apiHealthUrl = "$apiUrl/v1/health"

try {
  $apiHealthResponse = Invoke-WebRequest `
    -Uri $apiHealthUrl `
    -Headers @{
      Origin = $hostingUrl
    } `
    -UseBasicParsing `
    -TimeoutSec 30
}
catch {
  throw @"
The live API could not be reached before frontend deployment.

Health URL:
  $apiHealthUrl

Error:
  $($_.Exception.Message)
"@
}

if ($apiHealthResponse.StatusCode -ne 200) {
  throw "API health endpoint returned HTTP $($apiHealthResponse.StatusCode)."
}

try {
  $apiHealth = $apiHealthResponse.Content |
    ConvertFrom-Json
}
catch {
  throw "API health endpoint returned invalid JSON."
}

if ($apiHealth.status -ne "ok") {
  throw "API health endpoint did not report status=ok."
}

$apiAllowedOrigin = [string](
  $apiHealthResponse.Headers[
    "Access-Control-Allow-Origin"
  ]
)

if ($apiAllowedOrigin -ne $hostingUrl) {
  throw @"
Production API CORS verification failed.

Expected:
  $hostingUrl

Received:
  $apiAllowedOrigin
"@
}

Write-Host "API health verified: HTTP 200 / status=ok"
Write-Host "API CORS verified:   $apiAllowedOrigin"

# -------------------------------------------------------------------
# Check Firebase Hosting site
#
# Use hosting:sites:list instead of assuming that any failed GET means
# the site does not exist.
# -------------------------------------------------------------------

Write-Step "Checking Firebase Hosting site"

$hostingSitesJson = Invoke-ExternalCapture "firebase" @(
  "hosting:sites:list",
  "--project",
  $config.ProjectId,
  "--json"
)

if ([string]::IsNullOrWhiteSpace($hostingSitesJson)) {
  throw "Firebase CLI returned an empty Hosting site-list response."
}

try {
  $hostingSitesResponse = $hostingSitesJson |
    ConvertFrom-Json
}
catch {
  throw "Firebase Hosting site-list output could not be parsed as JSON."
}

$hostingSites = @()

if ($null -ne $hostingSitesResponse) {
  $topLevelProperties = @(
    $hostingSitesResponse.PSObject.Properties.Name
  )

  if ($topLevelProperties -contains "result") {
    $result = $hostingSitesResponse.result

    if ($null -ne $result) {
      if ($result -is [System.Array]) {
        $hostingSites = @($result)
      }
      else {
        $resultProperties = @(
          $result.PSObject.Properties.Name
        )

        if ($resultProperties -contains "sites") {
          $hostingSites = @($result.sites)
        }
        else {
          $hostingSites = @($result)
        }
      }
    }
  }
  elseif ($topLevelProperties -contains "sites") {
    $hostingSites = @($hostingSitesResponse.sites)
  }
  elseif ($hostingSitesResponse -is [System.Array]) {
    $hostingSites = @($hostingSitesResponse)
  }
}

$hostingSite = $hostingSites |
  Where-Object {
    if ($null -eq $_) {
      return $false
    }

    $properties = @(
      $_.PSObject.Properties.Name
    )

    $siteName = ""

    if ($properties -contains "name") {
      $siteName = [string]$_.name
    }

    $siteId = ""

    if ($properties -contains "site") {
      $siteId = [string]$_.site
    }
    elseif ($properties -contains "siteId") {
      $siteId = [string]$_.siteId
    }

    (
      $siteId -eq $config.ProjectId
    ) -or (
      $siteName -eq $config.ProjectId
    ) -or (
      $siteName -match
        "/sites/$([regex]::Escape($config.ProjectId))$"
    )
  } |
  Select-Object -First 1

if ($null -eq $hostingSite) {
  Write-Step "Creating Firebase Hosting site $($config.ProjectId)"

  Invoke-External "firebase" @(
    "hosting:sites:create",
    $config.ProjectId,
    "--project",
    $config.ProjectId
  )
}
else {
  Write-Host "Firebase Hosting site already exists: $($config.ProjectId)"
}

# Verify that the site now exists.
$hostingSiteJson = Invoke-ExternalCapture "firebase" @(
  "hosting:sites:get",
  $config.ProjectId,
  "--project",
  $config.ProjectId,
  "--json"
)

if ([string]::IsNullOrWhiteSpace($hostingSiteJson)) {
  throw "Firebase Hosting site could not be verified after setup."
}

Write-Host "Firebase Hosting site verified: $($config.ProjectId)"
Write-Host "Primary URL:   $hostingUrl"
Write-Host "Alternate URL: $hostingAlternateUrl"

# -------------------------------------------------------------------
# Verify local frontend deployment files
# -------------------------------------------------------------------

Write-Step "Checking frontend deployment files"

$requiredFrontendFiles = @(
  "firebase.json",
  "web/package.json",
  "web/package-lock.json",
  "web/vite.config.ts"
)

foreach ($relativePath in $requiredFrontendFiles) {
  $fullPath = Join-Path `
    $script:RepoRoot `
    $relativePath

  if (-not (Test-Path $fullPath)) {
    throw "Required frontend deployment file is missing: $relativePath"
  }
}

Write-Host "Frontend deployment files are present."

# -------------------------------------------------------------------
# Install dependencies, test, and build
# -------------------------------------------------------------------

Write-Step "Installing locked frontend dependencies"

Push-Location $script:RepoRoot

try {
  Invoke-External "npm" @(
    "--prefix",
    "web",
    "ci"
  )

  # ---------------------------------------------------------------
  # Production frontend environment
  # ---------------------------------------------------------------

  Write-Step "Running frontend quality gate against the live API"

  $previousApiBaseUrl = [Environment]::GetEnvironmentVariable(
    "VITE_API_BASE_URL",
    "Process"
  )

  try {
    [Environment]::SetEnvironmentVariable(
      "VITE_API_BASE_URL",
      $apiUrl,
      "Process"
    )

    Write-Host "VITE_API_BASE_URL=$apiUrl"

    Invoke-External "npm" @(
      "--prefix",
      "web",
      "run",
      "check"
    )

    # Run an explicit production build even if the quality-gate script
    # also builds. This guarantees that web/dist is the final artifact
    # created with the live API URL immediately before deployment.
    Write-Step "Building production frontend"

    Invoke-External "npm" @(
      "--prefix",
      "web",
      "run",
      "build"
    )
  }
  finally {
    if ($null -eq $previousApiBaseUrl) {
      [Environment]::SetEnvironmentVariable(
        "VITE_API_BASE_URL",
        $null,
        "Process"
      )
    }
    else {
      [Environment]::SetEnvironmentVariable(
        "VITE_API_BASE_URL",
        $previousApiBaseUrl,
        "Process"
      )
    }
  }

  # ---------------------------------------------------------------
  # Verify generated Vite output
  # ---------------------------------------------------------------

  Write-Step "Verifying production frontend build"

  $webDirectory = Join-Path `
    $script:RepoRoot `
    "web"

  $distDirectory = Join-Path `
    $webDirectory `
    "dist"

  $distIndexPath = Join-Path `
    $distDirectory `
    "index.html"

  if (-not (Test-Path $distDirectory)) {
    throw "Frontend build completed but web/dist does not exist."
  }

  if (-not (Test-Path $distIndexPath)) {
    throw "Frontend build completed but web/dist/index.html does not exist."
  }

  $distIndexContent = [System.IO.File]::ReadAllText(
    $distIndexPath
  )

  if ($distIndexContent -notmatch 'id=["'']root["'']') {
    throw "Built index.html does not contain the expected React root element."
  }

  # VITE_* values are embedded at build time. Confirm that the final
  # build actually contains the live Cloud Run URL.
  $buildFiles = Get-ChildItem `
    -Path $distDirectory `
    -Recurse `
    -File |
    Where-Object {
      $_.Extension -in @(
        ".js",
        ".html",
        ".css"
      )
    }

  $apiUrlEmbedded = $false

  foreach ($buildFile in $buildFiles) {
    $buildFileContent = [System.IO.File]::ReadAllText(
      $buildFile.FullName
    )

    if (
      $buildFileContent.IndexOf(
        $apiUrl,
        [System.StringComparison]::Ordinal
      ) -ge 0
    ) {
      $apiUrlEmbedded = $true
      break
    }
  }

  if (-not $apiUrlEmbedded) {
    throw @"
The production frontend build does not contain the live API URL.

Expected embedded VITE_API_BASE_URL:
  $apiUrl

Do not deploy this build.
"@
  }

  Write-Host "Production build verified."
  Write-Host "React root:            present"
  Write-Host "Live API URL embedded: yes"

  # ---------------------------------------------------------------
  # Deploy only Firebase Hosting
  # ---------------------------------------------------------------

  Write-Step "Deploying Firebase Hosting"

  Invoke-External "firebase" @(
    "deploy",
    "--only",
    "hosting",
    "--project",
    $config.ProjectId,
    "--non-interactive"
  )
}
finally {
  Pop-Location
}

# -------------------------------------------------------------------
# Verify live Firebase Hosting
# -------------------------------------------------------------------

Write-Step "Verifying live Firebase Hosting URL"

$hostingResponse = $null
$hostingError = $null

$maxHostingAttempts = 6
$hostingAttempt = 1

while (
  $hostingAttempt -le $maxHostingAttempts -and
  $null -eq $hostingResponse
) {
  try {
    Write-Host "Hosting check attempt $hostingAttempt of $maxHostingAttempts..."

    $hostingResponse = Invoke-WebRequest `
      -Uri $hostingUrl `
      -UseBasicParsing `
      -TimeoutSec 30
  }
  catch {
    $hostingError = $_

    if ($hostingAttempt -lt $maxHostingAttempts) {
      Start-Sleep -Seconds 5
    }
  }

  $hostingAttempt++
}

if ($null -eq $hostingResponse) {
  throw @"
Firebase Hosting deployment completed, but the live site could not be reached.

URL:
  $hostingUrl

Last error:
  $hostingError
"@
}

if ($hostingResponse.StatusCode -ne 200) {
  throw "Firebase Hosting returned HTTP $($hostingResponse.StatusCode)."
}

if ($hostingResponse.Content -notmatch 'id=["'']root["'']') {
  throw "Firebase Hosting returned HTTP 200, but the deployed page does not contain the expected React root element."
}

Write-Host "Firebase Hosting verified: HTTP 200"
Write-Host "React root verified."

# -------------------------------------------------------------------
# Verify alternate Firebase Hosting domain
# -------------------------------------------------------------------

Write-Step "Verifying alternate Firebase Hosting URL"

try {
  $alternateHostingResponse = Invoke-WebRequest `
    -Uri $hostingAlternateUrl `
    -UseBasicParsing `
    -TimeoutSec 30

  if ($alternateHostingResponse.StatusCode -ne 200) {
    throw "Alternate Hosting URL returned HTTP $($alternateHostingResponse.StatusCode)."
  }

  Write-Host "Alternate Hosting URL verified: HTTP 200"
}
catch {
  throw @"
Primary Hosting URL is live, but the alternate Firebase Hosting URL
could not be verified.

URL:
  $hostingAlternateUrl

Error:
  $($_.Exception.Message)
"@
}

# -------------------------------------------------------------------
# Final API/CORS verification after Hosting is live
# -------------------------------------------------------------------

Write-Step "Re-verifying API health and CORS after Hosting deployment"

$postDeployHealthResponse = Invoke-WebRequest `
  -Uri $apiHealthUrl `
  -Headers @{
    Origin = $hostingUrl
  } `
  -UseBasicParsing `
  -TimeoutSec 30

if ($postDeployHealthResponse.StatusCode -ne 200) {
  throw "Post-deployment API health check returned HTTP $($postDeployHealthResponse.StatusCode)."
}

$postDeployAllowedOrigin = [string](
  $postDeployHealthResponse.Headers[
    "Access-Control-Allow-Origin"
  ]
)

if ($postDeployAllowedOrigin -ne $hostingUrl) {
  throw @"
Post-deployment CORS verification failed.

Expected:
  $hostingUrl

Received:
  $postDeployAllowedOrigin
"@
}

Write-Host "API remains healthy."
Write-Host "Production CORS remains valid."

# -------------------------------------------------------------------
# Record deployment state
# -------------------------------------------------------------------

Write-Step "Recording frontend deployment state"

$state = Get-Phase4State

$state["projectId"] = $config.ProjectId
$state["apiUrl"] = $apiUrl
$state["hostingUrl"] = $hostingUrl
$state["hostingAlternateUrl"] = $hostingAlternateUrl
$state["hostingDeployed"] = $true
$state["hostingVerified"] = $true
$state["frontendBuiltAgainstApiUrl"] = $apiUrl

Save-Phase4State $state

# -------------------------------------------------------------------
# Final result
# -------------------------------------------------------------------

Write-Host ""
Write-Host "Frontend deployment passed." -ForegroundColor Green
Write-Host ""
Write-Host "Project:             $($config.ProjectId)"
Write-Host "Live application:    $hostingUrl"
Write-Host "Alternate URL:       $hostingAlternateUrl"
Write-Host "API:                 $apiUrl"
Write-Host "Hosting HTTP:        verified"
Write-Host "React root:          verified"
Write-Host "Production API URL:  embedded in frontend build"
Write-Host "API health:          verified"
Write-Host "Production CORS:     verified"