# Phase 4 — Google Cloud / Firebase Deployment Runbook

This phase turns the locally verified application into the live architecture required by the assignment:

```text
Browser
  ↓
Firebase Hosting (React/Vite static SPA)
  ↓ HTTPS
Cloud Run function-style Node.js 22 API
  ↓ Application Default Credentials
Cloud Firestore (Native mode)
```

The browser never receives Firestore credentials and never connects to Firestore directly.

## 0. Important cost/billing boundary

The code is configured to stay small and scale to zero, but a live Google Cloud serverless deployment can require a Google Cloud billing account even when actual usage remains inside no-cost quotas. Do not represent the live system as guaranteed $0 regardless of provider policy or future traffic.

The included defaults reduce cost risk:

- Cloud Run minimum instances: `0`
- Cloud Run maximum instances: `2`
- Cloud Run memory: `512Mi`
- Firestore Standard edition
- no PITR/backups/TTL in the take-home architecture
- Firebase Hosting static assets only

Set a Google Cloud budget/alert before review-day traffic if billing is enabled.

## 1. Prerequisites

Local workstation:

```text
Node.js 22.x
npm
Google Cloud CLI (gcloud)
Firebase CLI
```

Authenticate:

```powershell
gcloud auth login
gcloud auth application-default login
firebase login
```

`gcloud auth application-default login` is useful for local ADC workflows; deployed Cloud Run uses its runtime service account instead.

## 2. Create/select project and add Firebase

Create or select a globally unique Google Cloud project ID. The deployment scripts can create a project only when explicitly enabled in config; normally create/select it first in the Google Cloud console.

If the selected Google Cloud project is not already Firebase-enabled:

1. Open the Firebase console once and accept the Firebase Terms if prompted.
2. Run:

```powershell
firebase projects:addfirebase YOUR_GCP_PROJECT_ID
```

The Firebase project and Google Cloud project are the same underlying project.

## 3. Configure this repository

Copy:

```powershell
Copy-Item .\deploy\phase4.config.example.ps1 .\deploy\phase4.config.ps1
```

Edit at minimum:

```powershell
$ProjectId = "your-globally-unique-project-id"
$Region = "us-central1"
$FirestoreLocation = "us-central1"
```

**Firestore location is the important irreversible choice.** Prefer a location close to the API and expected reviewers. Once the default database exists, its location cannot simply be changed.

The edited config is gitignored.

## 4. Preflight

```powershell
.\deploy\00-preflight.ps1
```

It checks:

- Node 22
- npm
- gcloud
- Firebase CLI
- active gcloud identity
- selected project access
- Firebase project registration
- required repository files
- absence of placeholder project ID

## 5. Enable APIs and create least-privilege runtime identity

```powershell
.\deploy\01-enable-services.ps1
```

It enables the APIs used by:

- Cloud Run source deployment
- Cloud Build
- Artifact Registry
- Firestore
- Firebase / Hosting
- Cloud Logging
- IAM

It also creates:

```text
earthre-sla-api@PROJECT_ID.iam.gserviceaccount.com
```

and grants only:

```text
roles/datastore.user
```

for Firestore data access.

### If source deployment reports IAM errors

Google Cloud source builds can be affected by organization/project IAM policy. Do not solve that by granting broad Editor roles to the runtime service account. Instead, grant the documented deployer/build roles to the correct human/build identity for the project.

## 6. Create Firestore and deploy rules/indexes

```powershell
.\deploy\02-firestore.ps1
```

Behavior:

- reuses the existing `(default)` database if present
- otherwise creates one Firestore Native **Standard edition** database
- warns before first creation because location is permanent
- deploys `firestore.rules`
- deploys `firestore.indexes.json`

The browser rules intentionally deny direct reads/writes. The server accesses Firestore through IAM.

## 7. Deploy the Node.js 22 stateless API

```powershell
.\deploy\03-deploy-api.ps1
```

Before deployment it runs the backend quality gate. It then deploys from source with:

```text
function entry point     api
Node base image          nodejs22
minimum instances        0
maximum instances        2
CPU                      1
memory                   512Mi
concurrency              4
timeout                  300s
public invocation        enabled
runtime service account  dedicated datastore.user identity
```

The deployment uses `.gcloudignore`, so frontend dependencies/builds/tests/docs are not uploaded as backend build context.

Production CORS is configured to allow only:

```text
https://PROJECT_ID.web.app
https://PROJECT_ID.firebaseapp.com
```

plus the two built-in local development origins already defined in backend config.

The script resolves the real Cloud Run service URL and verifies:

```http
GET /v1/health
Origin: https://PROJECT_ID.web.app
```

including the CORS response header.

## 8. Build against the real API and deploy Firebase Hosting

```powershell
.\deploy\04-deploy-web.ps1
```

The script:

1. resolves the Cloud Run URL
2. ensures the default Firebase Hosting site exists
3. installs frontend dependencies from `web/package-lock.json`
4. sets `VITE_API_BASE_URL` only for the build process
5. runs the frontend typecheck/tests/build
6. deploys `web/dist` using `firebase.json`
7. verifies the live Hosting URL returns HTTP 200

Expected live application URL:

```text
https://PROJECT_ID.web.app
```

## 9. Run the live smoke test

Health/Hosting only:

```powershell
.\deploy\05-smoke-test.ps1
```

Full case-study flow:

```powershell
.\deploy\05-smoke-test.ps1 `
  -CsvPath "C:\path\to\monitoring_checks_9d_seed101.csv"
```

The full smoke test verifies:

- live Hosting
- API health
- production CORS
- real CSV upload through the deployed API
- persisted metadata re-query
- persisted summary re-query
- logs page 1
- cursor page 2 when available
- identical-file idempotency

The local result is written to ignored file:

```text
deploy/.phase4-smoke.json
```

## 10. Browser QA on the live URL

Repeat the final Phase 3 browser checks against the actual `web.app` URL:

```text
Dashboard restore
Collapse / expand
Single-date filter
Date-range filter
Latest day
Entire upload
Service filter
Rows-per-page
Next / Previous
Same-file re-upload
Invalid-upload recovery
Keyboard navigation
414px mobile
768px tablet
Desktop
Browser Console / Network errors
```

## 11. Record final URLs

After the live smoke test:

```powershell
.\deploy\06-record-live-urls.ps1 `
  -GitHubRepoUrl "https://github.com/OWNER/REPOSITORY"
```

It writes `docs/LIVE_DEPLOYMENT.md` and updates the marked live-deployment section in `README.md`.

Commit those URL/documentation changes before submission.

## 12. Final source-package cleanup

After all live deployment evidence is recorded:

```powershell
.\deploy\07-clean-release.ps1
```

This removes generated dependencies/builds/local deployment state and runs the source-package audit. Do not run `npm install`, `npm ci`, or builds again before creating the final submission ZIP, or generated artifacts will return.

## 13. Manual command equivalents

The scripts are conveniences, not magic. The key production API command is conceptually:

```powershell
gcloud run deploy earthre-sla-api `
  --source . `
  --function api `
  --base-image nodejs22 `
  --region REGION `
  --allow-unauthenticated
```

The exact script adds the runtime service account, cost/scaling limits and environment file.

Firestore config deployment:

```powershell
firebase deploy --only firestore --project PROJECT_ID
```

Hosting deployment after the Vite production build:

```powershell
firebase deploy --only hosting --project PROJECT_ID
```

## 14. Troubleshooting map

### `ORIGIN_NOT_ALLOWED`

The backend was deployed without the actual Hosting origin in `ALLOWED_ORIGIN`. Redeploy API after confirming the project ID / Hosting URL.

### API URL works but frontend still calls localhost

The Vite build did not receive the production `VITE_API_BASE_URL`. Rerun `deploy/04-deploy-web.ps1`; Vite environment values are build-time values.

### Firestore permission denied from API

Verify the Cloud Run service uses the dedicated runtime service account and that it has `roles/datastore.user`.

### Missing Firestore index

Redeploy:

```powershell
firebase deploy --only firestore --project PROJECT_ID
```

and wait for the composite index to finish building before retesting filtered logs.

### `firebase deploy` cannot find project

Run:

```powershell
firebase projects:list
```

If the Cloud project is absent, add Firebase to it first.

### Cloud Run deployment permission error

Review the deploying account/build service identity. Do not broaden the application runtime service account merely to fix deployment permissions.

## 15. Rollback

Firebase Hosting keeps release history; use the Hosting console or Firebase CLI release tooling to restore a prior static release.

Cloud Run keeps immutable revisions. In an emergency, route traffic back to a prior known-good revision through Cloud Run revision/traffic controls, then investigate the failed revision.

Firestore schema changes in this take-home are additive/config-driven; do not delete live upload data as part of application rollback.
