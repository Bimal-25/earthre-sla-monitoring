# Phase 2 API Contract

Base path: `/v1`

## `GET /health`

Returns `200`:

```json
{ "status": "ok", "version": "0.2.0" }
```

## `POST /uploads`

Required headers:

```text
Content-Type: text/csv
X-File-Name: monitoring_checks.csv
```

Body: raw UTF-8 CSV bytes.

Success status:

- `201` new upload processed and persisted
- `200` identical content already completed

The response includes upload metadata, data-quality counts and the interval-level overall summary.

## `GET /uploads/{uploadId}`

Returns persisted upload metadata.

`uploadId` is the 64-character lowercase SHA-256 of the original file bytes.

## `GET /uploads/{uploadId}/summary`

Query forms:

```text
(no dates)                    entire observed upload range
?from=2025-05-08              one UTC date
?from=2025-05-08&to=2025-05-10 inclusive UTC range
```

`to` without `from` is rejected.

The requested dates must fall inside the upload's observed canonical date range.

Response includes:

- overall operational metrics
- service-level metrics
- nearest-rank p95 normalized latency
- quality counts within the selection
- monthly SLA evaluation state for each service

## `GET /uploads/{uploadId}/logs`

Parameters:

```text
from       optional YYYY-MM-DD
to         optional YYYY-MM-DD
serviceId  optional exact service identifier
pageSize   optional 1..250, default 100
cursor     optional opaque pagination cursor
```

The cursor encodes the last deterministic sort key and is bound to its original date range and service filter.

Response shape:

```json
{
  "uploadId": "...",
  "period": { "from": "2025-05-08", "to": "2025-05-08" },
  "serviceId": null,
  "items": [],
  "nextCursor": null,
  "hasMore": false
}
```

The internal Firestore `sortKey` is intentionally not exposed.

## Error body

```json
{
  "error": {
    "code": "INVALID_DATE_RANGE",
    "message": "...",
    "details": {},
    "requestId": "..."
  }
}
```

`details` is omitted when not needed.
