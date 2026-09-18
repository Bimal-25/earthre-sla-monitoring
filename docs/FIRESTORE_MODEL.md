# Phase 2 Firestore Model

## Root upload document

```text
uploads/{uploadId}
```

`uploadId` is the SHA-256 hexadecimal digest of the raw CSV bytes.

Representative fields:

```text
uploadId
fileHash
filename
schemaVersion
status
createdAt
updatedAt
processedAt
failedAt
failure
rangeStartUtc
rangeEndUtc
rangeStartDate
rangeEndDate
services[]
sourceRowCount
storedObservationCount
exactDuplicateRowsRemoved
unassignedObservationCount
issueCounts
overall
```

Status transitions:

```text
new → processing → complete
                 ↘ failed → processing (retry)
```

A completed upload is immutable under the content-derived ID.

## Observations

```text
uploads/{uploadId}/observations/{observationId}
```

The deterministic observation ID is SHA-256 of the trimmed eight source-column values used by exact-source deduplication.

Important fields:

```text
observationId
uploadId
sortKey
sourceRow
sourceRows[]
duplicateCount
raw{}
serviceId
serviceName
agent
region
timestampRaw
timestampUtc
dateUtc
isOnExpectedCadence
statusCodeRaw
statusCode
healthState
latencyRaw
latencyUnitRaw
latencyMs
intervalKey
issues[]
```

The observation remains auditable even when individual normalized values are invalid.

## Daily statistics

```text
uploads/{uploadId}/dailyStats/{YYYY-MM-DD--encodedServiceId}
```

Fields:

```text
date
serviceId
serviceName
expectedIntervals
healthyIntervals
downIntervals
unknownIntervals
conflictedIntervals
resolvedIntervals
unresolvedIntervals
detectedDowntimeMinutes
latencySamplesMs[]
issueCounts{}
intervalStateCounts{}
```

The aggregate stores interval latency samples rather than only daily p95 because percentiles cannot safely be aggregated by averaging percentile values.

## Query indexes

Unfiltered date-range observation queries use the single-field `sortKey` index.

Filtering by service requires the provided composite index:

```text
serviceId ASC
sortKey   ASC
```

## Write strategy

Firestore batches are kept below the 500-write limit (`450` writes/batch).

Child observation and daily-stat documents are written before the parent upload is finalized as `complete`.

This does not attempt a single transaction across an entire 15k-row dataset because Firestore transaction/batch limits make that inappropriate. The parent status is therefore the consistency boundary presented to readers.
