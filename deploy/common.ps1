Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -------------------------------------------------------------------
# Paths
# -------------------------------------------------------------------

$script:DeployDir = $PSScriptRoot
$script:RepoRoot = Split-Path -Parent $PSScriptRoot
$script:ConfigPath = Join-Path $PSScriptRoot "phase4.config.ps1"
$script:StatePath = Join-Path $PSScriptRoot ".phase4-state.json"

# -------------------------------------------------------------------
# Console output
# -------------------------------------------------------------------

function Write-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

# -------------------------------------------------------------------
# External command resolution
#
# Windows PowerShell 5.1 can behave badly with npm-generated .ps1
# wrappers when native tools write progress messages to stderr.
#
# Prefer native .cmd / .exe launchers on Windows.
# -------------------------------------------------------------------

function Resolve-ExternalCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  # If a full/relative executable path was supplied, use it directly.
  if (
    $Name -match '[\\/]' -and
    (Test-Path $Name)
  ) {
    return (Resolve-Path $Name).Path
  }

  $candidates = @()

  if ($env:OS -eq "Windows_NT") {
    # If caller already supplied an extension, try it first.
    if ($Name -match '\.(exe|cmd|bat|com)$') {
      $candidates += $Name
    }
    else {
      # Prefer Windows native shims over PowerShell wrappers.
      $candidates += "$Name.cmd"
      $candidates += "$Name.exe"
      $candidates += "$Name.bat"
      $candidates += $Name
    }
  }
  else {
    $candidates += $Name
  }

  foreach ($candidate in $candidates) {
    $resolved = Get-Command `
      $candidate `
      -ErrorAction SilentlyContinue |
      Select-Object -First 1

    if ($null -ne $resolved) {
      if (-not [string]::IsNullOrWhiteSpace([string]$resolved.Source)) {
        return [string]$resolved.Source
      }

      if (-not [string]::IsNullOrWhiteSpace([string]$resolved.Definition)) {
        return [string]$resolved.Definition
      }
    }
  }

  throw "Required command '$Name' was not found on PATH."
}

function Assert-Command {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $null = Resolve-ExternalCommand $Name
}

# -------------------------------------------------------------------
# Execute an external command and stream its output.
# -------------------------------------------------------------------

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $false)]
    [string[]]$Arguments = @()
  )

  $command = Resolve-ExternalCommand $FilePath

  # Windows PowerShell 5.1 can wrap native stderr as ErrorRecords.
  # Do not treat harmless progress output as a terminating error.
  $previousErrorActionPreference = $ErrorActionPreference
  $exitCode = $null

  try {
    $ErrorActionPreference = "Continue"

    & $command @Arguments

    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($null -eq $exitCode) {
    throw "Could not determine exit code for command: $FilePath"
  }

  if ($exitCode -ne 0) {
    throw "Command failed with exit code ${exitCode}: $FilePath $($Arguments -join ' ')"
  }
}

# -------------------------------------------------------------------
# Execute an external command and capture stdout.
#
# stderr is suppressed deliberately because tools such as Firebase CLI
# write progress/spinner output there even when successful.
# -------------------------------------------------------------------

function Invoke-ExternalCapture {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $false)]
    [string[]]$Arguments = @()
  )

  $command = Resolve-ExternalCommand $FilePath

  $previousErrorActionPreference = $ErrorActionPreference
  $exitCode = $null
  $output = $null

  try {
    $ErrorActionPreference = "Continue"

    $output = (
      & $command @Arguments 2>$null
    ) -join "`n"

    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($null -eq $exitCode) {
    throw "Could not determine exit code for command: $FilePath"
  }

  if ($exitCode -ne 0) {
    throw "Command failed with exit code ${exitCode}: $FilePath $($Arguments -join ' ')"
  }

  return [string]$output
}

# -------------------------------------------------------------------
# Phase IV configuration
# -------------------------------------------------------------------

function Import-Phase4Config {
  if (-not (Test-Path $script:ConfigPath)) {
    throw @"
Missing deploy/phase4.config.ps1.

Create it from:

  deploy/phase4.config.example.ps1

Then enter the real Firebase / Google Cloud project settings.
"@
  }

  # Load the environment-specific configuration into this function scope.
  . $script:ConfigPath

  $required = @(
    "ProjectId",
    "ProjectDisplayName",
    "CreateProjectIfMissing",
    "Region",
    "FirestoreLocation",
    "ApiServiceName",
    "RuntimeServiceAccountName",
    "MinInstances",
    "MaxInstances",
    "Concurrency",
    "Cpu",
    "Memory",
    "Timeout",
    "MaxUploadBytes",
    "MaxCsvRows",
    "DefaultPageSize",
    "MaxPageSize",
    "SlaTargetPercent"
  )

  foreach ($name in $required) {
    $variable = Get-Variable `
      -Name $name `
      -ErrorAction SilentlyContinue

    if ($null -eq $variable) {
      throw "Configuration value '$name' is missing from deploy/phase4.config.ps1."
    }

    $value = $variable.Value

    if (
      ($value -is [string]) -and
      (
        [string]::IsNullOrWhiteSpace($value) -or
        $value -match "YOUR_"
      )
    ) {
      throw "Configuration value '$name' is missing or still contains a placeholder."
    }
  }

  # Google Cloud project IDs:
  # - 6 to 30 characters
  # - start with a lowercase letter
  # - lowercase letters, digits, hyphens
  # - end with letter or digit
  if ($ProjectId -notmatch '^[a-z][a-z0-9-]{4,28}[a-z0-9]$') {
    throw "ProjectId '$ProjectId' does not look like a valid Google Cloud project ID."
  }

  if ([string]::IsNullOrWhiteSpace($Region)) {
    throw "Region must not be empty."
  }

  if ([string]::IsNullOrWhiteSpace($FirestoreLocation)) {
    throw "FirestoreLocation must not be empty."
  }

  if ($MinInstances -lt 0) {
    throw "MinInstances cannot be negative."
  }

  if ($MaxInstances -lt 1) {
    throw "MaxInstances must be at least 1."
  }

  if ($MaxInstances -lt $MinInstances) {
    throw "MaxInstances cannot be smaller than MinInstances."
  }

  if ($Concurrency -lt 1) {
    throw "Concurrency must be at least 1."
  }

  if ([string]::IsNullOrWhiteSpace($Cpu)) {
    throw "Cpu must not be empty."
  }

  if ([string]::IsNullOrWhiteSpace($Memory)) {
    throw "Memory must not be empty."
  }

  if ([string]::IsNullOrWhiteSpace($Timeout)) {
    throw "Timeout must not be empty."
  }

  if ($MaxUploadBytes -lt 1) {
    throw "MaxUploadBytes must be greater than zero."
  }

  if ($MaxCsvRows -lt 1) {
    throw "MaxCsvRows must be greater than zero."
  }

  if ($DefaultPageSize -lt 1) {
    throw "DefaultPageSize must be greater than zero."
  }

  if ($MaxPageSize -lt $DefaultPageSize) {
    throw "MaxPageSize cannot be smaller than DefaultPageSize."
  }

  if (
    $SlaTargetPercent -le 0 -or
    $SlaTargetPercent -gt 100
  ) {
    throw "SlaTargetPercent must be greater than 0 and at most 100."
  }

  return @{
    ProjectId = [string]$ProjectId
    ProjectDisplayName = [string]$ProjectDisplayName
    CreateProjectIfMissing = [bool]$CreateProjectIfMissing

    Region = [string]$Region
    FirestoreLocation = [string]$FirestoreLocation

    ApiServiceName = [string]$ApiServiceName
    RuntimeServiceAccountName = [string]$RuntimeServiceAccountName

    MinInstances = [int]$MinInstances
    MaxInstances = [int]$MaxInstances
    Concurrency = [int]$Concurrency

    Cpu = [string]$Cpu
    Memory = [string]$Memory
    Timeout = [string]$Timeout

    MaxUploadBytes = [int]$MaxUploadBytes
    MaxCsvRows = [int]$MaxCsvRows

    DefaultPageSize = [int]$DefaultPageSize
    MaxPageSize = [int]$MaxPageSize

    SlaTargetPercent = [double]$SlaTargetPercent
  }
}

# -------------------------------------------------------------------
# Firebase Hosting URLs
# -------------------------------------------------------------------

function Get-HostingUrl {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId
  )

  return "https://${ProjectId}.web.app"
}

function Get-HostingAlternateUrl {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId
  )

  return "https://${ProjectId}.firebaseapp.com"
}

# -------------------------------------------------------------------
# Google Cloud service account
# -------------------------------------------------------------------

function Get-RuntimeServiceAccountEmail {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$ProjectId
  )

  return "${Name}@${ProjectId}.iam.gserviceaccount.com"
}

# -------------------------------------------------------------------
# Phase IV state
# -------------------------------------------------------------------

function Get-Phase4State {
  if (-not (Test-Path $script:StatePath)) {
    return @{}
  }

  $raw = Get-Content `
    -Raw `
    -Path $script:StatePath

  if ([string]::IsNullOrWhiteSpace($raw)) {
    return @{}
  }

  $object = $raw | ConvertFrom-Json

  if ($null -eq $object) {
    return @{}
  }

  # Convert PSCustomObject into a normal hashtable.
  # Compatible with Windows PowerShell 5.1 and PowerShell 7+.
  $state = @{}

  foreach ($property in $object.PSObject.Properties) {
    $state[$property.Name] = $property.Value
  }

  return $state
}

function Save-Phase4State {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$State
  )

  $State["updatedAtUtc"] = [DateTime]::UtcNow.ToString("o")

  $json = $State |
    ConvertTo-Json -Depth 10

  $json |
    Set-Content `
      -Encoding UTF8 `
      -Path $script:StatePath
}