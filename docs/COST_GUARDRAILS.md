# Cost / Free-Tier Guardrails

The assignment requires free-tier/no-cost-oriented resources. Provider billing policy is separate from application design, so this project documents the boundary instead of promising an unconditional $0 bill.

## Firestore

Use one **Standard edition** database only. The assignment does not require PITR, backups, restores, clones, or TTL-driven deletion.

The application minimizes read/write amplification by:

- deduplicating before persistence
- storing daily aggregates for summary queries
- using cursor pagination rather than offsets
- avoiding direct browser Firestore access

## Cloud Run function-style API

Deployment defaults:

```text
min instances  0
max instances  2
CPU            1
memory         512Mi
concurrency    4
timeout        300s
```

`min instances = 0` avoids intentionally warm idle instances. `max instances = 2` protects a take-home deployment from accidental unbounded scale while still demonstrating serverless behavior.

## Firebase Hosting

Only the generated static Vite assets are hosted. Source files, CSV fixtures, dependencies, backend build output and debug logs are not deployed to Hosting.

## Build/deployment costs

Cloud Run source deployments use Cloud Build and Artifact Registry. Even when runtime traffic remains within no-cost quotas, build/artifact/provider-account rules can differ. Check the project billing page after deployment and remove unused build artifacts/projects after the review window if appropriate.

## Recommended operational safeguards

- create a small Google Cloud budget and alert
- keep Cloud Run minimum instances at zero
- keep maximum instances low for the take-home
- do not enable paid Firestore durability features for this assignment
- monitor Firestore reads/writes and Hosting transfer during review
- leave authentication/multi-tenancy out because the assignment explicitly excludes them
