param(
  [string]$CsvPath = ""
)

. (Join-Path $PSScriptRoot "common.ps1")

$config = Import-Phase4Config
$state = Get-Phase4State

# -------------------------------------------------------------------
# Resolve production URLs
# -------------------------------------------------------------------

Write-Step "Resolving production deployment URLs"

$apiUrl = ""

if (
  $state.ContainsKey("apiUrl") -and
  -not [string]::IsNullOrWhiteSpace(
    [string]$state["apiUrl"]
  )
) {
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

Deploy the API first:

  .\deploy\03-deploy-api.ps1
"@
}

$apiUrl = $apiUrl.TrimEnd("/")

if ($apiUrl -notmatch '^https://') {
  throw "Unexpected API URL: '$apiUrl'"
}

$hostingUrl = Get-HostingUrl $config.ProjectId
$hostingAlternateUrl = Get-HostingAlternateUrl $config.ProjectId

Write-Host "Hosting: $hostingUrl"
Write-Host "API:     $apiUrl"

# -------------------------------------------------------------------
# Smoke-test report
# -------------------------------------------------------------------

$report = [ordered]@{
  timestampUtc = [DateTime]::UtcNow.ToString("o")
  projectId = $config.ProjectId

  hostingUrl = $hostingUrl
  hostingAlternateUrl = $hostingAlternateUrl
  apiUrl = $apiUrl

  hosting = "NOT_RUN"
  alternateHosting = "NOT_RUN"
  health = "NOT_RUN"
  cors = "NOT_RUN"
  corsPreflight = "NOT_RUN"

  upload = "NOT_RUN"
  localHashMatch = "NOT_RUN"
  persistence = "NOT_RUN"
  metadata = "NOT_RUN"
  summary = "NOT_RUN"
  dateFilter = "NOT_RUN"
  logs = "NOT_RUN"
  pagination = "NOT_RUN"
  serviceFilter = "NOT_RUN"
  idempotency = "NOT_RUN"

  fullEndToEnd = "NOT_RUN"
}

# -------------------------------------------------------------------
# Live Firebase Hosting
# -------------------------------------------------------------------

Write-Step "Smoke testing primary Firebase Hosting URL"

try {
  $hostingResponse = Invoke-WebRequest `
    -Uri $hostingUrl `
    -UseBasicParsing `
    -TimeoutSec 30
}
catch {
  throw @"
Primary Firebase Hosting URL could not be reached.

URL:
  $hostingUrl

Error:
  $($_.Exception.Message)
"@
}

if ($hostingResponse.StatusCode -ne 200) {
  throw "Live frontend returned HTTP $($hostingResponse.StatusCode)."
}

if (
  $hostingResponse.Content -notmatch
    'id=["'']root["'']'
) {
  throw "Live frontend returned HTTP 200 but does not contain the React root element."
}

$report["hosting"] = "PASS"

Write-Host "Primary Hosting: HTTP 200"
Write-Host "React root:      present"

# -------------------------------------------------------------------
# Alternate Firebase Hosting domain
# -------------------------------------------------------------------

Write-Step "Smoke testing alternate Firebase Hosting URL"

try {
  $alternateHostingResponse = Invoke-WebRequest `
    -Uri $hostingAlternateUrl `
    -UseBasicParsing `
    -TimeoutSec 30
}
catch {
  throw @"
Alternate Firebase Hosting URL could not be reached.

URL:
  $hostingAlternateUrl

Error:
  $($_.Exception.Message)
"@
}

if ($alternateHostingResponse.StatusCode -ne 200) {
  throw "Alternate Hosting URL returned HTTP $($alternateHostingResponse.StatusCode)."
}

$report["alternateHosting"] = "PASS"

Write-Host "Alternate Hosting: HTTP 200"

# -------------------------------------------------------------------
# API health + production CORS
# -------------------------------------------------------------------

Write-Step "Smoke testing API health and production CORS"

$healthUrl = "$apiUrl/v1/health"

try {
  $healthResponse = Invoke-WebRequest `
    -Uri $healthUrl `
    -Headers @{
      Origin = $hostingUrl
    } `
    -UseBasicParsing `
    -TimeoutSec 30
}
catch {
  throw @"
API health endpoint could not be reached.

URL:
  $healthUrl

Error:
  $($_.Exception.Message)
"@
}

if ($healthResponse.StatusCode -ne 200) {
  throw "API health returned HTTP $($healthResponse.StatusCode)."
}

try {
  $health = $healthResponse.Content |
    ConvertFrom-Json
}
catch {
  throw "API health returned HTTP 200 but did not contain valid JSON."
}

if ($health.status -ne "ok") {
  throw "API health did not report status=ok."
}

$allowedOrigin = [string](
  $healthResponse.Headers[
    "Access-Control-Allow-Origin"
  ]
)

if ($allowedOrigin -ne $hostingUrl) {
  throw @"
Production CORS verification failed.

Expected:
  $hostingUrl

Received:
  $allowedOrigin
"@
}

$report["health"] = "PASS"
$report["cors"] = "PASS"

if (
  $health.PSObject.Properties.Name -contains
    "version"
) {
  $report["apiVersion"] = [string]$health.version
}

Write-Host "API health: HTTP 200 / status=ok"
Write-Host "CORS:       $allowedOrigin"

# -------------------------------------------------------------------
# Browser CORS preflight
#
# The frontend upload uses text/csv plus X-File-Name, so browsers will
# send an OPTIONS preflight before POST /v1/uploads.
# -------------------------------------------------------------------

Write-Step "Smoke testing browser upload CORS preflight"

try {
  $preflightResponse = Invoke-WebRequest `
    -Method Options `
    -Uri "$apiUrl/v1/uploads" `
    -Headers @{
      Origin = $hostingUrl
      "Access-Control-Request-Method" = "POST"
      "Access-Control-Request-Headers" = "content-type,x-file-name"
    } `
    -UseBasicParsing `
    -TimeoutSec 30
}
catch {
  throw @"
Browser CORS preflight failed.

Endpoint:
  $apiUrl/v1/uploads

Error:
  $($_.Exception.Message)
"@
}

if ($preflightResponse.StatusCode -ne 204) {
  throw "CORS preflight returned HTTP $($preflightResponse.StatusCode). Expected 204."
}

$preflightOrigin = [string](
  $preflightResponse.Headers[
    "Access-Control-Allow-Origin"
  ]
)

$preflightMethods = [string](
  $preflightResponse.Headers[
    "Access-Control-Allow-Methods"
  ]
)

$preflightHeaders = [string](
  $preflightResponse.Headers[
    "Access-Control-Allow-Headers"
  ]
)

if ($preflightOrigin -ne $hostingUrl) {
  throw "CORS preflight did not allow the production Hosting origin."
}

if ($preflightMethods -notmatch '(?i)(^|,)\s*POST\s*(,|$)') {
  throw "CORS preflight did not allow POST."
}

if ($preflightHeaders -notmatch '(?i)Content-Type') {
  throw "CORS preflight did not allow Content-Type."
}

if ($preflightHeaders -notmatch '(?i)X-File-Name') {
  throw "CORS preflight did not allow X-File-Name."
}

$report["corsPreflight"] = "PASS"

Write-Host "CORS preflight: HTTP 204"
Write-Host "POST:           allowed"
Write-Host "Content-Type:   allowed"
Write-Host "X-File-Name:    allowed"

# -------------------------------------------------------------------
# CSV-dependent end-to-end test
# -------------------------------------------------------------------

if ([string]::IsNullOrWhiteSpace($CsvPath)) {
  Write-Warning @"
No CsvPath was supplied.

Hosting, API health, CORS, and browser preflight were tested, but the
production upload/persistence/summary/log/filter/idempotency workflow
was NOT tested.

For final Phase IV acceptance, rerun this script with the supplied CSV:

  .\deploy\05-smoke-test.ps1 -CsvPath "FULL_PATH_TO_CSV"
"@
}
else {
  # -----------------------------------------------------------------
  # Validate source CSV
  # -----------------------------------------------------------------

  Write-Step "Validating smoke-test CSV"

  if (-not (Test-Path $CsvPath -PathType Leaf)) {
    throw "CSV does not exist: $CsvPath"
  }

  $resolvedCsvPath = (
    Resolve-Path $CsvPath
  ).Path

  $csvFile = Get-Item $resolvedCsvPath

  if ($csvFile.Length -lt 1) {
    throw "CSV file is empty: $resolvedCsvPath"
  }

  if ($csvFile.Length -gt $config.MaxUploadBytes) {
    throw @"
CSV exceeds the configured API upload limit.

CSV bytes:
  $($csvFile.Length)

Maximum:
  $($config.MaxUploadBytes)
"@
  }

  $filename = [IO.Path]::GetFileName(
    $resolvedCsvPath
  )

  $localHash = (
    Get-FileHash `
      -Path $resolvedCsvPath `
      -Algorithm SHA256
  ).Hash.ToLowerInvariant()

  Write-Host "CSV:        $resolvedCsvPath"
  Write-Host "Bytes:      $($csvFile.Length)"
  Write-Host "SHA-256:    $localHash"

  $uploadHeaders = @{
    Origin = $hostingUrl
    "X-File-Name" = $filename
  }

  # -----------------------------------------------------------------
  # First upload
  # -----------------------------------------------------------------

  Write-Step "Uploading real CSV to the live stateless API"

  try {
    $upload1 = Invoke-RestMethod `
      -Method Post `
      -Uri "$apiUrl/v1/uploads" `
      -ContentType "text/csv" `
      -Headers $uploadHeaders `
      -InFile $resolvedCsvPath `
      -TimeoutSec 300
  }
  catch {
    throw @"
Live CSV upload failed.

Endpoint:
  $apiUrl/v1/uploads

File:
  $resolvedCsvPath

Error:
  $($_.Exception.Message)
"@
  }

  $uploadId = [string]$upload1.upload.uploadId

  if ($uploadId -notmatch '^[a-f0-9]{64}$') {
    throw "Upload did not return a valid SHA-256 upload ID."
  }

  if ($upload1.upload.status -ne "complete") {
    throw "Upload did not complete successfully. Status: '$($upload1.upload.status)'."
  }

  if ($uploadId -ne $localHash) {
    throw @"
Content-addressed upload ID does not match the local CSV SHA-256.

Local SHA-256:
  $localHash

API upload ID:
  $uploadId
"@
  }

  $report["upload"] = "PASS"
  $report["localHashMatch"] = "PASS"
  $report["uploadId"] = $uploadId
  $report["filename"] = $filename
  $report["initialAlreadyProcessed"] = [bool]$upload1.alreadyProcessed

  Write-Host "Upload complete."
  Write-Host "Upload ID:         $uploadId"
  Write-Host "SHA-256 verified:  yes"
  Write-Host "Already processed: $($upload1.alreadyProcessed)"

  # -----------------------------------------------------------------
  # Persistence / upload metadata
  # -----------------------------------------------------------------

  Write-Step "Re-querying persisted upload metadata"

  $metadata = Invoke-RestMethod `
    -Method Get `
    -Uri "$apiUrl/v1/uploads/$uploadId" `
    -Headers @{
      Origin = $hostingUrl
    } `
    -TimeoutSec 60

  if ($metadata.upload.uploadId -ne $uploadId) {
    throw "Metadata response did not match the uploaded ID."
  }

  if ($metadata.upload.status -ne "complete") {
    throw "Persisted upload metadata is not complete."
  }

  if ($metadata.upload.counts.sourceRows -lt 1) {
    throw "Persisted upload metadata reported no source rows."
  }

  if ($metadata.upload.counts.storedObservations -lt 1) {
    throw "Persisted upload metadata reported no stored observations."
  }

  if (@($metadata.upload.services).Count -lt 1) {
    throw "Persisted upload metadata reported no services."
  }

  $report["persistence"] = "PASS"
  $report["metadata"] = "PASS"
  $report["sourceRows"] = [int]$metadata.upload.counts.sourceRows
  $report["storedObservations"] = [int]$metadata.upload.counts.storedObservations
  $report["exactDuplicateRowsRemoved"] = [int]$metadata.upload.counts.exactDuplicateRowsRemoved
  $report["serviceCount"] = @($metadata.upload.services).Count

  Write-Host "Persistence verified."
  Write-Host "Source rows:          $($metadata.upload.counts.sourceRows)"
  Write-Host "Stored observations:  $($metadata.upload.counts.storedObservations)"
  Write-Host "Exact duplicates:     $($metadata.upload.counts.exactDuplicateRowsRemoved)"
  Write-Host "Services:             $(@($metadata.upload.services).Count)"

  # -----------------------------------------------------------------
  # Persisted summary
  # -----------------------------------------------------------------

  Write-Step "Re-querying persisted summary"

  $summary = Invoke-RestMethod `
    -Method Get `
    -Uri "$apiUrl/v1/uploads/$uploadId/summary" `
    -Headers @{
      Origin = $hostingUrl
    } `
    -TimeoutSec 60

  if ($summary.uploadId -ne $uploadId) {
    throw "Summary response did not match the upload ID."
  }

  if ($summary.overall.expectedIntervals -lt 1) {
    throw "Summary did not contain expected intervals."
  }

  if (@($summary.services).Count -ne @($metadata.upload.services).Count) {
    throw "Summary service count does not match persisted upload metadata."
  }

  if (
    $null -ne $metadata.upload.overall -and
    $metadata.upload.overall.expectedIntervals -ne
      $summary.overall.expectedIntervals
  ) {
    throw "Summary expected-interval count does not match persisted upload metadata."
  }

  $report["summary"] = "PASS"
  $report["expectedIntervals"] = [int]$summary.overall.expectedIntervals
  $report["resolvedIntervals"] = [int]$summary.overall.resolvedIntervals
  $report["availabilityPercent"] = $summary.overall.availabilityPercent
  $report["coveragePercent"] = $summary.overall.coveragePercent
  $report["detectedDowntimeMinutes"] = [int]$summary.overall.detectedDowntimeMinutes

  Write-Host "Summary verified."
  Write-Host "Expected intervals: $($summary.overall.expectedIntervals)"
  Write-Host "Resolved intervals: $($summary.overall.resolvedIntervals)"
  Write-Host "Availability:       $($summary.overall.availabilityPercent)%"
  Write-Host "Coverage:           $($summary.overall.coveragePercent)%"
  Write-Host "Downtime minutes:   $($summary.overall.detectedDowntimeMinutes)"

  # -----------------------------------------------------------------
  # Date filter
  # -----------------------------------------------------------------

  Write-Step "Checking persisted single-date filtering"

  $startDate = [string]$metadata.upload.range.startDate

  if ([string]::IsNullOrWhiteSpace($startDate)) {
    throw "Upload metadata did not include a start date."
  }

  $encodedStartDate = [uri]::EscapeDataString(
    $startDate
  )

  $singleDateSummary = Invoke-RestMethod `
    -Method Get `
    -Uri "$apiUrl/v1/uploads/$uploadId/summary?from=$encodedStartDate&to=$encodedStartDate" `
    -Headers @{
      Origin = $hostingUrl
    } `
    -TimeoutSec 60

  if (
    $singleDateSummary.period.from -ne $startDate -or
    $singleDateSummary.period.to -ne $startDate
  ) {
    throw "Single-date summary filter did not preserve the requested date."
  }

  if ($singleDateSummary.overall.expectedIntervals -lt 1) {
    throw "Single-date summary returned no expected intervals."
  }

  $report["dateFilter"] = "PASS"
  $report["dateFilterValue"] = $startDate

  Write-Host "Single-date filter verified: $startDate"

  # -----------------------------------------------------------------
  # Logs page 1
  # -----------------------------------------------------------------

  Write-Step "Checking persisted logs page 1"

  $logs1 = Invoke-RestMethod `
    -Method Get `
    -Uri "$apiUrl/v1/uploads/$uploadId/logs?pageSize=5" `
    -Headers @{
      Origin = $hostingUrl
    } `
    -TimeoutSec 60

  $logs1Items = @($logs1.items)

  if ($logs1Items.Count -lt 1) {
    throw "Logs page 1 was empty."
  }

  foreach ($item in $logs1Items) {
    if (
      [string]::IsNullOrWhiteSpace(
        [string]$item.observationId
      )
    ) {
      throw "A logs page 1 record did not contain an observationId."
    }
  }

  $report["logs"] = "PASS"

  Write-Host "Logs page 1: $($logs1Items.Count) records"

  # -----------------------------------------------------------------
  # Cursor pagination
  # -----------------------------------------------------------------

  Write-Step "Checking cursor pagination"

  $storedObservationCount = [int]$metadata.upload.counts.storedObservations

  if (
    [string]::IsNullOrWhiteSpace(
      [string]$logs1.nextCursor
    )
  ) {
    if ($storedObservationCount -gt 5) {
      throw "Logs contain more than five observations but page 1 did not return a pagination cursor."
    }

    $report["pagination"] = "NO_SECOND_PAGE"

    Write-Host "No second logs page was required."
  }
  else {
    $cursor = [uri]::EscapeDataString(
      [string]$logs1.nextCursor
    )

    $logs2 = Invoke-RestMethod `
      -Method Get `
      -Uri "$apiUrl/v1/uploads/$uploadId/logs?pageSize=5&cursor=$cursor" `
      -Headers @{
        Origin = $hostingUrl
      } `
      -TimeoutSec 60

    $logs2Items = @($logs2.items)

    if ($logs2Items.Count -lt 1) {
      throw "Logs page 2 was empty despite page 1 returning a cursor."
    }

    $ids1 = @(
      $logs1Items |
        ForEach-Object {
          [string]$_.observationId
        }
    )

    $ids2 = @(
      $logs2Items |
        ForEach-Object {
          [string]$_.observationId
        }
    )

    $overlap = @(
      $ids1 |
        Where-Object {
          $ids2 -contains $_
        }
    )

    if ($overlap.Count -gt 0) {
      throw "Cursor pagination repeated one or more observations across pages."
    }

    $report["pagination"] = "PASS"

    Write-Host "Logs page 2: $($logs2Items.Count) records"
    Write-Host "Cursor pagination: no duplicate records across pages"
  }

  # -----------------------------------------------------------------
  # Service filtering
  # -----------------------------------------------------------------

  Write-Step "Checking service filtering"

  $filterService = $metadata.upload.services |
    Select-Object -First 1

  $serviceId = [string]$filterService.serviceId

  if ([string]::IsNullOrWhiteSpace($serviceId)) {
    throw "Could not determine a service ID for filter testing."
  }

  $encodedServiceId = [uri]::EscapeDataString(
    $serviceId
  )

  $filteredLogs = Invoke-RestMethod `
    -Method Get `
    -Uri "$apiUrl/v1/uploads/$uploadId/logs?serviceId=$encodedServiceId&pageSize=20" `
    -Headers @{
      Origin = $hostingUrl
    } `
    -TimeoutSec 60

  if ($filteredLogs.serviceId -ne $serviceId) {
    throw "Filtered logs response did not preserve the requested serviceId."
  }

  $filteredItems = @($filteredLogs.items)

  if ($filteredItems.Count -lt 1) {
    throw "Service-filtered logs were unexpectedly empty."
  }

  $wrongServiceItems = @(
    $filteredItems |
      Where-Object {
        [string]$_.serviceId -ne $serviceId
      }
  )

  if ($wrongServiceItems.Count -gt 0) {
    throw "Service-filtered logs returned observations from another service."
  }

  $report["serviceFilter"] = "PASS"
  $report["filteredServiceId"] = $serviceId

  Write-Host "Service filter verified: $serviceId"
  Write-Host "Filtered records checked: $($filteredItems.Count)"

  # -----------------------------------------------------------------
  # Idempotent duplicate upload
  # -----------------------------------------------------------------

  Write-Step "Uploading identical CSV again to prove idempotency"

  $upload2 = Invoke-RestMethod `
    -Method Post `
    -Uri "$apiUrl/v1/uploads" `
    -ContentType "text/csv" `
    -Headers $uploadHeaders `
    -InFile $resolvedCsvPath `
    -TimeoutSec 300

  if ($upload2.upload.uploadId -ne $uploadId) {
    throw @"
Identical CSV content produced a different upload ID.

First:
  $uploadId

Second:
  $($upload2.upload.uploadId)
"@
  }

  if ($upload2.alreadyProcessed -ne $true) {
    throw "Second identical upload was not reported as already processed."
  }

  if ($upload2.upload.status -ne "complete") {
    throw "Idempotent duplicate upload did not return complete persisted metadata."
  }

  $report["idempotency"] = "PASS"
  $report["fullEndToEnd"] = "PASS"

  Write-Host "Idempotency verified."
  Write-Host "Duplicate upload ID: $($upload2.upload.uploadId)"
  Write-Host "alreadyProcessed:    true"
}

# -------------------------------------------------------------------
# Save smoke-test evidence
# -------------------------------------------------------------------

Write-Step "Recording live smoke-test evidence"

$smokePath = Join-Path `
  $PSScriptRoot `
  ".phase4-smoke.json"

$reportJson = $report |
  ConvertTo-Json -Depth 10

# Write JSON as UTF-8 without BOM for predictable tooling behavior.
$utf8WithoutBom = New-Object `
  System.Text.UTF8Encoding($false)

[System.IO.File]::WriteAllText(
  $smokePath,
  $reportJson,
  $utf8WithoutBom
)

$state = Get-Phase4State

$state["liveInfrastructureSmokeVerified"] = $true
$state["liveInfrastructureSmokeVerifiedAtUtc"] = [DateTime]::UtcNow.ToString("o")

if ($report["fullEndToEnd"] -eq "PASS") {
  $state["liveSmokeVerified"] = $true
  $state["liveSmokeVerifiedAtUtc"] = [DateTime]::UtcNow.ToString("o")
  $state["liveSmokeUploadId"] = [string]$report["uploadId"]
}
else {
  $state["liveSmokeVerified"] = $false
}

Save-Phase4State $state

# -------------------------------------------------------------------
# Final result
# -------------------------------------------------------------------

Write-Host ""
Write-Host "Live smoke test completed." -ForegroundColor Green
Write-Host ""

$report |
  Format-List

Write-Host ""
Write-Host "Smoke evidence: $smokePath"

if ($report["fullEndToEnd"] -ne "PASS") {
  Write-Warning "Infrastructure smoke passed, but the full CSV end-to-end smoke test is still required."
}
else {
  Write-Host ""
  Write-Host "Full production end-to-end smoke test: PASS" -ForegroundColor Green
}