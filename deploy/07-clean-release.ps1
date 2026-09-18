. (Join-Path $PSScriptRoot "common.ps1")

Write-Step "Removing generated dependency, build, emulator, test and local-state artifacts"
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
  $path = Join-Path $script:RepoRoot $relative
  Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
}

Get-ChildItem -Path $script:RepoRoot -Recurse -File -Filter "*.tsbuildinfo" |
  Remove-Item -Force -ErrorAction SilentlyContinue

Remove-Item -Force (Join-Path $PSScriptRoot ".runtime-env.yaml") -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $PSScriptRoot ".phase4-state.json") -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $PSScriptRoot ".phase4-smoke.json") -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $PSScriptRoot "phase4.config.ps1") -ErrorAction SilentlyContinue

Write-Step "Running source-package cleanliness audit"
Push-Location $script:RepoRoot
try {
  Invoke-External "node" @("scripts/audit-package.cjs")
} finally {
  Pop-Location
}

Write-Host "`nRelease cleanup completed." -ForegroundColor Green
Write-Host "Do not run npm ci/install again before creating the handoff ZIP."
