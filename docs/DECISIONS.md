# Phase 1 Decisions

This file records decisions that are easy to lose when implementation work moves into later phases.

## D-001 — Raw rows do not equal SLA intervals

**Decision:** Calculate availability once per `(serviceId, timestampUtc)` 15-minute interval.

**Reason:** The supplied data can contain multiple independent agent observations for the same interval. Counting rows would give those intervals extra weight.

## D-002 — Exact duplicates are different from multi-agent observations

**Decision:** Collapse only identical source observations. Keep different agents separate.

**Reason:** Independent agent results are evidence that may agree, disagree, or rescue an otherwise invalid observation.

## D-003 — Invalid telemetry is not downtime

**Decision:** Invalid status values, malformed timestamps, and malformed latency are data-quality findings. They are not automatically converted into service failure.

**Reason:** A monitoring-pipeline defect and a service outage are different failure modes.

## D-004 — Unknown/conflicted intervals are unresolved

**Decision:** Exclude unresolved intervals from observed availability and show them through coverage.

**Reason:** Treating missing/conflicting evidence as success would overstate availability; treating it as downtime would invent a policy not given in the assignment.

## D-005 — Global observed interval window

**Decision:** Generate expected slots from the earliest through latest valid on-cadence timestamp observed anywhere in the upload, for every discovered service.

**Reason:** This detects a service missing checks while other services continue reporting. We do not generate slots outside the observable upload boundaries because the file cannot prove those external periods were intended to be present.

## D-006 — Median latency for a multi-agent interval

**Decision:** Use the median of available normalized latency measurements for the interval-level representative latency.

**Reason:** It gives every interval one latency value while reducing sensitivity to redundant agents and outliers.

## D-007 — No cloud/database/UI dependencies in Phase 1

**Decision:** The correctness core has no Google Cloud, Firestore, React, or HTTP dependencies.

**Reason:** Pure domain logic is easier to test, defend, and reuse in the serverless function.

## D-008 — Repository boundary for persistence

**Decision:** Application services depend on `UploadRepository`, not Firestore directly.

**Reason:** The HTTP/application code can be tested deterministically with `InMemoryUploadRepository`, while production uses `FirestoreUploadRepository`. This keeps database concerns out of SLA semantics.

## D-009 — Raw file SHA-256 is the upload identity

**Decision:** Use SHA-256 of the original file bytes as both idempotency key and upload document ID.

**Reason:** Retries of identical content become safe and do not duplicate persisted monitoring data.

## D-010 — Persist daily aggregates plus interval latency samples

**Decision:** Persist daily service interval counts and the small list of representative interval latencies.

**Reason:** Date-range summary queries remain cheap while p95 remains mathematically correct. Averaging daily p95 values is not correct.

## D-011 — Parent upload status is the reader consistency boundary

**Decision:** Write observation and daily-stat child documents before marking the parent upload `complete`.

**Reason:** A 15k-row upload cannot be committed as one Firestore atomic batch. Readers therefore use parent status to avoid treating a partially persisted upload as complete.

## D-012 — Cursor pagination uses deterministic chronological sort keys

**Decision:** Store `timestampUtc|observationId` as the observation `sortKey` and use `startAfter` pagination.

**Reason:** Cursor pagination is stable for multiple agent observations at the same timestamp and avoids offset-style scan costs.

## D-013 — Pagination cursors are query-bound

**Decision:** Encode the date range and optional service filter into the opaque cursor payload and reject mismatches.

**Reason:** A cursor from one query must not silently be reused against another filter and produce inconsistent results.

## D-014 — Monthly SLA evaluation is per service and guarded

**Decision:** Only return an evaluable monthly SLA result for a service when the selected range is a complete calendar month, the upload covers the month boundaries, and that service has complete resolved monitoring coverage.

**Reason:** The case-study files are partial/cross-month datasets. Operational availability can be shown, but an unsupported contractual billing conclusion must not be invented.

## D-015 — Browser never accesses Firestore directly

**Decision:** Firestore rules deny browser reads/writes; all data access goes through the deployed API.

**Reason:** It centralizes validation, SLA semantics, pagination and data-access policy in one server boundary and keeps cloud credentials out of the frontend.

## D-016 — Cloud Run function-style deployment for the stateless API

**Decision:** Deploy the existing `api` Functions Framework export as a public Cloud Run function-style service from source using the Node.js 22 base image.

**Reason:** It preserves the tested stateless handler boundary, uses the same Node 22 runtime as local verification, scales to zero, and is a real managed serverless deployment rather than a local/container substitute.

## D-017 — Firebase Hosting serves only the static React build

**Decision:** Build the Vite frontend with the deployed API URL and publish `web/dist` to classic Firebase Hosting.

**Reason:** The frontend remains a static SPA with no server-side rendering requirement. Firebase Hosting provides a simple CDN-backed live URL and keeps the browser separate from Firestore.

## D-018 — API and Firestore should be colocated where practical

**Decision:** Choose the Firestore location deliberately before database creation and normally deploy the Cloud Run API in the same region.

**Reason:** Firestore database location is effectively permanent. Colocation reduces latency and cross-region data-transfer risk.

## D-019 — Dedicated runtime service account with least-required data role

**Decision:** Run the API as a dedicated service account granted `roles/datastore.user` rather than relying on broad default runtime identities.

**Reason:** The API needs Firestore data access but does not need project-wide Editor privileges.

## D-020 — Production CORS is explicit, not wildcard

**Decision:** Configure the API with the Firebase Hosting origins (`PROJECT_ID.web.app` and `PROJECT_ID.firebaseapp.com`) and keep local origins only as built-in development exceptions.

**Reason:** The API is public for browser use, but arbitrary browser origins should not be silently trusted. Explicit origin configuration also makes deployment mistakes visible.

## D-021 — Deployment configuration/state is local and ignored

**Decision:** Commit only `deploy/phase4.config.example.ps1`. Ignore the edited config, generated runtime env file, deployment state, and smoke-test result.

**Reason:** Project IDs and URLs are not secrets, but environment-specific state should not become accidental source-of-truth configuration. The committed example documents every required value without coupling the repository to one account.

## D-022 — Cost guardrails favor scale-to-zero

**Decision:** Default deployment guidance uses zero minimum instances, a small maximum instance count, and no paid Firestore features such as PITR/backups/TTL.

**Reason:** The assignment requires no-cost/free-tier-oriented resources. These settings minimize idle compute and avoid Firestore features that do not have free usage.
