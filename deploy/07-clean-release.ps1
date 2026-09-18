. (Join-Path $PSScriptRoot "common.ps1")

# -------------------------------------------------------------------
# Final release cleanup
#
# This script intentionally removes local deployment state,
# dependencies, compiled output, and environment-specific files before
# creating the final handoff archive.
#
# Run only after:
#   - live production smoke test passed
#   - README / LIVE_DEPLOYMENT.md were generated
#   - final source changes were committed and pushed
# -------------------------------------------------------------------

Write-Step "Validating final release prerequisites"

# -------------------------------------------------------------------
# Require Phase IV state before deleting it
# -------------------------------------------------------------------

$state = Get-Phase4State

if ($state.Count -eq 0) {
  throw @"
Phase IV deployment state is missing.

Do not run final cleanup until the production deployment and live smoke
test have completed.
"@
}

if (
  -not $state.ContainsKey("liveSmokeVerified") -or
  $state["liveSmokeVerified"] -ne $true
) {
  throw "Full production smoke verification has not been recorded."
}

if (
  -not $state.ContainsKey("liveDocumentationRecorded") -or
  $state["liveDocumentationRecorded"] -ne $true
) {
  throw "Live deployment documentation has not been recorded."
}

if (
  -not $state.ContainsKey("githubRepoRecorded") -or
  $state["githubRepoRecorded"] -ne $true
) {
  throw "The GitHub repository URL has not been recorded."
}

$apiUrl = [string]$state["apiUrl"]
$hostingUrl = [string]$state["hostingUrl"]
$githubRepoUrl = [string]$state["githubRepoUrl"]

if ([string]::IsNullOrWhiteSpace($apiUrl)) {
  throw "Deployment state is missing apiUrl."
}

if ([string]::IsNullOrWhiteSpace($hostingUrl)) {
  throw "Deployment state is missing hostingUrl."
}

if ([string]::IsNullOrWhiteSpace($githubRepoUrl)) {
  throw "Deployment state is missing githubRepoUrl."
}

Write-Host "Production smoke test: PASS"
Write-Host "Live documentation:   recorded"
Write-Host "GitHub repository:    $githubRepoUrl"
Write-Host "Live application:     $hostingUrl"
Write-Host "API:                  $apiUrl"

# -------------------------------------------------------------------
# Verify generated documentation exists and contains no placeholders
# -------------------------------------------------------------------

Write-Step "Validating final deployment documentation"

$readmePath = Join-Path `
  $script:RepoRoot `
  "README.md"

$liveDeploymentPath = Join-Path `
  $script:RepoRoot `
  "docs\LIVE_DEPLOYMENT.md"

if (-not (Test-Path $readmePath -PathType Leaf)) {
  throw "README.md is missing."
}

if (-not (Test-Path $liveDeploymentPath -PathType Leaf)) {
  throw "docs/LIVE_DEPLOYMENT.md is missing."
}

$readme = [System.IO.File]::ReadAllText(
  $readmePath
)

$liveDeployment = [System.IO.File]::ReadAllText(
  $liveDeploymentPath
)

$requiredReadmeValues = @(
  $githubRepoUrl,
  $hostingUrl,
  $apiUrl,
  "Production smoke test:** PASS"
)

foreach ($value in $requiredReadmeValues) {
  if (
    $readme.IndexOf(
      $value,
      [System.StringComparison]::Ordinal
    ) -lt 0
  ) {
    throw "README.md is missing required live deployment value: $value"
  }
}

$requiredLiveRecordValues = @(
  $githubRepoUrl,
  $hostingUrl,
  $apiUrl,
  "**Status:** PASS"
)

foreach ($value in $requiredLiveRecordValues) {
  if (
    $liveDeployment.IndexOf(
      $value,
      [System.StringComparison]::Ordinal
    ) -lt 0
  ) {
    throw "docs/LIVE_DEPLOYMENT.md is missing required value: $value"
  }
}

if ($readme -match '\bPENDING\b') {
  throw "README.md still contains PENDING."
}

if ($liveDeployment -match '\bPENDING\b') {
  throw "docs/LIVE_DEPLOYMENT.md still contains PENDING."
}

Write-Host "README live deployment record verified."
Write-Host "docs/LIVE_DEPLOYMENT.md verified."

# -------------------------------------------------------------------
# Verify Git is available and this is a repository
# -------------------------------------------------------------------

Write-Step "Checking Git repository state"

Assert-Command "git"

Push-Location $script:RepoRoot

try {
  $gitRoot = (
    Invoke-ExternalCapture "git" @(
      "rev-parse",
      "--show-toplevel"
    )
  ).Trim()

  if ([string]::IsNullOrWhiteSpace($gitRoot)) {
    throw "Could not determine Git repository root."
  }

  Write-Host "Git repository: $gitRoot"

  # ---------------------------------------------------------------
  # Protect tracked files from accidental cleanup
  # ---------------------------------------------------------------

  $localOnlyCandidates = @(
    "deploy/phase4.config.ps1",
    "deploy/.phase4-state.json",
    "deploy/.phase4-smoke.json",
    "deploy/.runtime-env.yaml",
    "node_modules",
    "dist",
    "web/node_modules",
    "web/dist",
    ".firebase",
    "coverage",
    "web/coverage",
    ".env",
    "web/.env",
    "firestore-debug.log",
    "firebase-debug.log"
  )

  $trackedCleanupTargets = @()

  foreach ($candidate in $localOnlyCandidates) {
    $tracked = Invoke-ExternalCapture "git" @(
      "ls-files",
      "--",
      $candidate
    )

    if (
      -not [string]::IsNullOrWhiteSpace(
        [string]$tracked
      )
    ) {
      $trackedCleanupTargets += $tracked
    }
  }

  if ($trackedCleanupTargets.Count -gt 0) {
    throw (
      "Cleanup stopped because one or more cleanup targets are tracked by Git:`r`n`r`n" +
      ($trackedCleanupTargets -join "`r`n")
    )
  }

  Write-Host "Local deployment/build artifacts are not tracked."

  # ---------------------------------------------------------------
  # Require tracked source changes to be committed first
  # ---------------------------------------------------------------

  $gitStatus = Invoke-ExternalCapture "git" @(
    "status",
    "--porcelain",
    "--untracked-files=normal"
  )

  if (
    -not [string]::IsNullOrWhiteSpace(
      [string]$gitStatus
    )
  ) {
    throw (
      "Repository has uncommitted source/documentation changes.`r`n`r`n" +
      "$gitStatus`r`n`r`n" +
      "Commit and push the final changes before running cleanup."
    )
  }

  Write-Host "Tracked repository state is clean."
}
finally {
  Pop-Location
}

# -------------------------------------------------------------------
# Confirm destructive local cleanup
# -------------------------------------------------------------------

Write-Host ""
Write-Warning @"
This final step will remove local-only deployment state and generated
artifacts, including:

  deploy/phase4.config.ps1
  deploy/.phase4-state.json
  deploy/.phase4-smoke.json
  node_modules
  web/node_modules
  dist / web/dist

The verified production evidence already exists in README.md and
docs/LIVE_DEPLOYMENT.md.
"@

$confirmation = Read-Host "Type CLEAN to continue"

if ($confirmation -cne "CLEAN") {
  throw "Final release cleanup cancelled."
}

# -------------------------------------------------------------------
# Remove generated dependency/build/test artifacts
# -------------------------------------------------------------------

Write-Step "Removing generated dependency, build, emulator and test artifacts"

$paths = @(
  "node_modules",
  "dist",
  "web/node_modules",
  "web/dist",
  ".firebase",
  "coverage",
  "web/coverage",
  ".env",
  "web/.env",
  "firestore-debug.log",
  "firebase-debug.log"
)

foreach ($relative in $paths) {
  $path = Join-Path `
    $script:RepoRoot `
    $relative

  if (Test-Path $path) {
    Remove-Item `
      -Recurse `
      -Force `
      $path `
      -ErrorAction Stop

    Write-Host "Removed: $relative"
  }
}

# Remove TypeScript incremental build metadata.
Get-ChildItem `
  -Path $script:RepoRoot `
  -Recurse `
  -File `
  -Filter "*.tsbuildinfo" `
  -ErrorAction SilentlyContinue |
  Where-Object {
    $_.FullName -notmatch '[\\/]\.git[\\/]'
  } |
  Remove-Item `
    -Force `
    -ErrorAction SilentlyContinue

# -------------------------------------------------------------------
# Remove local deployment-only state
# -------------------------------------------------------------------

Write-Step "Removing local Phase IV deployment state"

$deploymentLocalFiles = @(
  ".runtime-env.yaml",
  ".phase4-state.json",
  ".phase4-smoke.json",
  "phase4.config.ps1"
)

foreach ($filename in $deploymentLocalFiles) {
  $path = Join-Path `
    $PSScriptRoot `
    $filename

  if (Test-Path $path) {
    Remove-Item `
      -Force `
      $path `
      -ErrorAction Stop

    Write-Host "Removed: deploy/$filename"
  }
}

# -------------------------------------------------------------------
# Run package cleanliness audit
# -------------------------------------------------------------------

Write-Step "Running source-package cleanliness audit"

Push-Location $script:RepoRoot

try {
  Invoke-External "node" @(
    "scripts/audit-package.cjs"
  )
}
finally {
  Pop-Location
}

# -------------------------------------------------------------------
# Verify cleanup did not modify tracked repository contents
# -------------------------------------------------------------------

Write-Step "Verifying Git repository after cleanup"

Push-Location $script:RepoRoot

try {
  $finalGitStatus = Invoke-ExternalCapture "git" @(
    "status",
    "--porcelain",
    "--untracked-files=normal"
  )

  if (
    -not [string]::IsNullOrWhiteSpace(
      [string]$finalGitStatus
    )
  ) {
    throw (
      "Cleanup completed, but tracked/untracked repository content changed unexpectedly:`r`n`r`n" +
      $finalGitStatus
    )
  }
}
finally {
  Pop-Location
}

# -------------------------------------------------------------------
# Final result
# -------------------------------------------------------------------

Write-Host ""
Write-Host "Release cleanup completed." -ForegroundColor Green
Write-Host ""
Write-Host "Package cleanliness audit: PASS"
Write-Host "Git working tree:          clean"
Write-Host ""
Write-Host "Do not run npm ci/install again before creating the final handoff ZIP."