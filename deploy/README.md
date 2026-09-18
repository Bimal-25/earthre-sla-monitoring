# Phase 4 deployment scripts

Run from the repository root in PowerShell, in numeric order.

1. `00-preflight.ps1` — tool/auth/project/Firebase checks
2. `01-enable-services.ps1` — required APIs + dedicated runtime service account
3. `02-firestore.ps1` — create/reuse Firestore + deploy rules/indexes
4. `03-deploy-api.ps1` — backend gate + Node 22 Cloud Run function-style deployment + health/CORS verification
5. `04-deploy-web.ps1` — frontend gate/build against live API + Firebase Hosting deployment
6. `05-smoke-test.ps1` — live Hosting/API/CSV/persistence/pagination/idempotency verification
7. `06-record-live-urls.ps1` — write live URLs/verified timestamp into docs
8. `07-clean-release.ps1` — remove generated/local artifacts and audit source handoff

Before step 1:

```powershell
Copy-Item .\deploy\phase4.config.example.ps1 .\deploy\phase4.config.ps1
```

Then edit `phase4.config.ps1`. The edited file and generated deployment state are gitignored.

See `docs/PHASE4_DEPLOYMENT.md` for the full runbook, cost notes, troubleshooting and rollback.
