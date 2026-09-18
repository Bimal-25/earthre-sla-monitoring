<img width="1672" height="941" alt="Bimal=EarthRe SLA Monitoring-Full Stack Architecture" src="https://github.com/user-attachments/assets/2b08d7c4-e345-4f29-af1e-12eb78c04568" />
# EarthRe SLA Monitoring Dashboard â€” Phase 4 Deployment Package

A correctness-first full-stack implementation of the EarthRe SLA take-home assignment.

The project accepts a monitoring CSV, sends it through a real stateless serverless API boundary, cleans and reconciles multi-agent observations, persists queryable data in Firestore, and renders a responsive operational dashboard from API responses.

<!-- PHASE4_LIVE_START -->
## Live deployment

- **GitHub repository:** https://github.com/Bimal-25/earthre-sla-monitoring
- **Live application:** https://earthre-sla-monitoring.web.app
- **API base URL:** https://earthre-sla-api-scyc46bywq-uc.a.run.app
- **API health:** https://earthre-sla-api-scyc46bywq-uc.a.run.app/v1/health
- **Production smoke test:** PASS
- **Last verified live (UTC):** 2026-09-18T15:39:37.4370855Z

The production smoke test verified upload, persistence, summary, date
filtering, logs, cursor pagination, service filtering, browser CORS, and
idempotent re-upload of the supplied monitoring CSV.

<!-- PHASE4_LIVE_END -->

The repository intentionally does not claim a live deployment until the Phase 4 live smoke test has passed. Run `deploy/06-record-live-urls.ps1` after deployment to populate these fields and generate `docs/LIVE_DEPLOYMENT.md`.

---

## Architecture

```text
User browser
    â”‚
    â”‚ HTTPS
    â–¼
Firebase Hosting
React + TypeScript + Vite + Vanilla CSS
    â”‚
    â”‚ raw CSV upload / summary / logs
    â–¼
Cloud Run function-style Node.js 22 API
stateless Functions Framework handler
    â”‚
    â”œâ”€â”€ Phase 1 parser / validation / normalization
    â”œâ”€â”€ exact deduplication
    â”œâ”€â”€ canonical 15-minute interval reconciliation
    â”œâ”€â”€ availability + coverage + downtime + p95
    â”‚
    â–¼
Cloud Firestore
uploads/{uploadId}
    â”œâ”€â”€ observations/{observationId}
    â””â”€â”€ dailyStats/{date--serviceId}
```

### Why these pieces

**React + Vite + Vanilla CSS** keeps the frontend small, explicit and easy to defend. No UI/CSS framework hides responsive behavior.

**Cloud Run function-style service** provides the required real stateless serverless compute boundary while preserving the same tested `api` Functions Framework export used locally.

**Firestore** provides persistent, re-queryable storage without adding a database server to operate. Application code talks to an `UploadRepository` interface so SLA semantics are not coupled to Firestore.

**Firebase Hosting** serves only the static SPA through a managed CDN. The browser never connects directly to Firestore.

---

## End-to-end flow

1. User selects or drags a `.csv` file into the upload UI.
2. Browser sends the **raw CSV body** to `POST /v1/uploads`.
3. API validates size/content/schema and runs the correctness core.
4. Rows are normalized and exact duplicates are removed.
5. Independent agents are reconciled into one canonical state per service/15-minute interval.
6. Observations, upload metadata and daily summary aggregates are persisted in Firestore.
7. Parent upload is marked `complete` only after child persistence succeeds.
8. Browser receives the SHA-256 upload ID and navigates to the persisted dashboard.
9. Summary/date/log requests re-query Firestore through the API.
10. Identical file content reuses the same SHA-256 upload identity.

---

## Correctness rules

### SLA denominator

Raw CSV rows are **not** availability intervals. Multiple agents can report the same service/time slot.

The canonical denominator is one interval per:

```text
(serviceId, 15-minute timestamp)
```

### Health reconciliation

- HTTP `2xx` and `3xx` â†’ healthy evidence
- HTTP `4xx` and `5xx` â†’ down evidence
- valid agents agreeing â†’ one resolved interval
- valid agents disagreeing â†’ conflicted interval
- invalid telemetry does not manufacture success or downtime
- unknown/conflicted intervals reduce monitoring coverage

### Availability vs coverage

```text
availability = healthy / (healthy + down)
coverage     = resolved / expected
```

The UI reports both because incomplete monitoring must not silently inflate or invent availability.

### Monthly SLA guard

The assignment background discusses a monthly 99.9% SLA. The supplied case-study datasets are not complete calendar months.

The API therefore returns operational observed availability for any selected period but marks contractual monthly SLA evaluation as non-evaluable unless the selected service has a complete calendar month with complete resolved monitoring coverage.

---

## Data findings

Production logic discovers these conditions dynamically; counts below are validation evidence from the supplied case-study files, not hardcoded expectations.

| Dataset | Source rows | Exact duplicates removed | Stored observations | Canonical intervals | Unix timestamps | Missing latency | Negative latency | Invalid status | Unresolved intervals |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `monitoring_checks_9d_seed101.csv` | 4,672 | 6 | 4,666 | 4,320 | 70 | 56 | 1 | 1 | 1 |
| `monitoring_checks_12d_seed505.csv` | 6,230 | 8 | 6,222 | 5,760 | 93 | 74 | 1 | 1 | 1 |
| `monitoring_checks_14d_seed202.csv` | 7,269 | 10 | 7,259 | 6,720 | 109 | 87 | 1 | 1 | 0 |
| `monitoring_checks_21d_seed303.csv` | 10,904 | 18 | 10,886 | 10,080 | 163 | 130 | 1 | 1 | 1 |
| `monitoring_checks_30d_seed404.csv` | 15,577 | 24 | 15,553 | 14,400 | 233 | 186 | 1 | 1 | 1 |

Issues handled:

- ISO and Unix timestamps are normalized to UTC.
- Unix epoch seconds are detected and recorded as a quality finding.
- Epoch milliseconds are handled defensively.
- timezone-less timestamps are rejected as ambiguous.
- impossible ISO calendar dates are rejected instead of silently normalized by JavaScript.
- second-based latency values are normalized to milliseconds.
- missing latency remains auditable without destroying usable HTTP health evidence.
- negative/non-numeric/unsupported latency is rejected as telemetry quality failure.
- invalid HTTP status values such as `999` are recorded rather than converted into downtime.
- exact repeated source observations are collapsed while preserving source-row provenance.
- observations from different monitoring agents are retained and reconciled rather than deduplicated away.
- off-cadence observations remain auditable but are not assigned to a 15-minute SLA interval.

See `docs/CASE_STUDY_DATA_VALIDATION.md` and `docs/DECISIONS.md`.

---

## Dashboard

### Monitoring summary

Collapsible section containing:

- observed availability
- monitoring coverage
- detected downtime
- p95 normalized latency
- per-service metrics
- monthly SLA evaluability state
- data-quality findings

### Logs

Filters:

- single date
- inclusive date range
- service
- rows per page
- Entire upload shortcut
- Latest day shortcut

Pagination uses opaque query-bound backend cursors. The browser caches already loaded forward pages to support Previous navigation without inventing reverse cursors.

### Responsive behavior

```text
>= 1024 CSS px    desktop header + four KPIs + operational tables
480â€“1023 px       stacked header + balanced 2Ã—2 KPI grid + responsive records
<= 560 px         one-column filters/service/log records
```

The logs keep semantic table markup for accessibility, but on tablet/mobile CSS presents each observation as a complete record card. Users do not have to horizontally drag through a seven-column desktop table.

---

## API

```http
GET  /v1/health
POST /v1/uploads
GET  /v1/uploads/{uploadId}
GET  /v1/uploads/{uploadId}/summary
GET  /v1/uploads/{uploadId}/logs
```

Important properties:

- raw CSV upload
- SHA-256 idempotency
- structured JSON errors
- request IDs
- explicit CORS allow-list
- byte/row/page-size limits
- stable query-bound cursor pagination

See `docs/API_CONTRACT.md`.

---

## Firestore model

```text
uploads/{uploadId}
  metadata, state, quality, overall result

uploads/{uploadId}/observations/{observationId}
  cleaned/auditable observations + deterministic sort key

uploads/{uploadId}/dailyStats/{date--serviceId}
  daily canonical interval counters + representative latency samples
```

The browser security rules intentionally deny direct Firestore reads/writes. The deployed API accesses Firestore with its runtime IAM identity.

See `docs/FIRESTORE_MODEL.md`.

---

## Runtime requirements

Local development:

- Node.js **22.x**
- npm
- Java 21+ for Firestore Emulator
- Firebase CLI for emulator/Hosting

Phase 4 deployment additionally requires:

- Google Cloud CLI (`gcloud`)
- authenticated Google Cloud/Firebase account with required project permissions

The repository uses `engine-strict=true` so unsupported Node major versions fail early.

---

## Local install and full quality gate

From the repository root:

```powershell
npm ci
npm --prefix web ci
npm run check:all
```

Final recorded Phase 3 gate:

```text
Backend tests       61 / 61 PASS
Frontend tests      11 / 11 PASS
Backend build               PASS
Frontend build              PASS
```

See `docs/TEST_REPORT.md`.

---

## Local Firestore/API/frontend

### Terminal 1 â€” Firestore Emulator

```powershell
firebase emulators:start --only firestore --project earthre-sla-local
```

Configured endpoints:

```text
Firestore  127.0.0.1:8085
UI         127.0.0.1:4000
```

### Terminal 2 â€” API

```powershell
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8085"
$env:GOOGLE_CLOUD_PROJECT="earthre-sla-local"
npm run serve
```

API:

```text
http://localhost:8080
```

Health:

```text
http://localhost:8080/v1/health
```

### Terminal 3 â€” frontend

```powershell
Copy-Item .\web\.env.example .\web\.env
npm run web:dev
```

Frontend:

```text
http://localhost:5173
```

`web/.env.example` defaults to the local API URL.

---

## Analyze a CSV without persistence

```powershell
npm run analyze -- "C:\path\to\monitoring_checks_9d_seed101.csv"
```

This is useful for correctness inspection without Firestore.

---

## Phase 4 deployment

Start with:

```powershell
Copy-Item .\deploy\phase4.config.example.ps1 .\deploy\phase4.config.ps1
```

Edit the project/region values, then run in order:

```powershell
.\deploy\00-preflight.ps1
.\deploy\01-enable-services.ps1
.\deploy\02-firestore.ps1
.\deploy\03-deploy-api.ps1
.\deploy\04-deploy-web.ps1
.\deploy\05-smoke-test.ps1 -CsvPath "C:\path\to\monitoring_checks_9d_seed101.csv"
.\deploy\06-record-live-urls.ps1 -GitHubRepoUrl "https://github.com/OWNER/REPOSITORY"
```

Full explanation, IAM notes, CORS behavior, troubleshooting and rollback:

```text
docs/PHASE4_DEPLOYMENT.md
```

Cost/free-tier-oriented guardrails:

```text
docs/COST_GUARDRAILS.md
```

---

## Source-package cleanliness

Run after removing generated artifacts:

```powershell
npm run package:audit
```

It fails if the source handoff still contains dependency/build directories, logs, TypeScript incremental files, local `.env` files, or unexpected >1 MiB files.

Phase 4 cleanup helper:

```powershell
.\deploy\07-clean-release.ps1
```

Do not run installs/builds again after release cleanup and before zipping the clean source handoff.

---

## Assumptions

- Source checks are expected every 15 minutes per service.
- The observed global timestamp window defines the expected interval window; the file cannot prove intended checks outside its boundaries.
- `2xx`/`3xx` are healthy; `4xx`/`5xx` are down.
- `1xx` is syntactically valid HTTP but does not resolve final service health.
- Invalid telemetry is a quality problem, not automatic downtime.
- Multi-agent disagreement is `conflicted`, not resolved by choosing an arbitrary winner.
- Representative interval latency is the median of usable normalized agent latencies.
- Summary p95 uses the explicitly tested nearest-rank percentile implementation.
- SLA target defaults to 99.9% and is configurable server-side.
- One uploaded dataset is the product scope; authentication, users and multi-tenancy are explicitly out of assignment scope.
- The default Firestore database is sufficient for the take-home.
- Firebase Hosting origin is the production browser origin; API CORS is explicit rather than wildcard.

---

## Security / operational notes

- no authentication/user-account feature is added because it is explicitly out of scope
- browser has no Firestore SDK/credentials
- Firestore browser rules deny direct access
- API runtime uses a dedicated service account in Phase 4 deployment guidance
- production CORS is explicit
- request IDs are returned/surfaced for debugging
- stack traces are not exposed to the UI
- environment-specific deployment config/state is gitignored
- no secret is required by this application; provider credentials stay in gcloud/Firebase auth stores, not source files

---

## What I would do differently with more time

- run automated end-to-end browser tests against a disposable deployed environment
- add infrastructure-as-code after the manual cloud architecture is proven and understood
- add structured metrics/alerts around failed uploads, latency and Firestore errors
- add a stale `processing` upload lease/recovery policy for crashes that occur after idempotency claim but before success/failure recording
- add a deployment preview/staging project if this became a maintained product
- add accessibility automation in addition to the completed keyboard/manual smoke pass
- add data-retention tooling if persisted uploads need lifecycle cleanup
- revisit authentication only if product scope changes; it is intentionally omitted here

---

## Final submission audit

Use:

```text
docs/FINAL_SUBMISSION_CHECKLIST.md
```

The checklist covers repository hygiene, live infrastructure, live case-study flow, responsiveness, README URLs and reviewer-defense topics.
