# Final Submission Checklist

## Repository hygiene

- [ ] meaningful Git commit history exists
- [ ] `node_modules/` absent
- [ ] `dist/` and `web/dist/` absent from source handoff unless intentionally submitting a deployment artifact
- [ ] `.env` files absent
- [ ] `*.log`, emulator state and `*.tsbuildinfo` absent
- [ ] both package lockfiles committed
- [ ] `node scripts/audit-package.cjs` passes on the clean source package

## Automated verification

- [ ] Node.js 22.x
- [ ] `npm ci`
- [ ] `npm --prefix web ci`
- [ ] `npm run check:all`
- [ ] backend 61/61
- [ ] frontend 11/11
- [ ] Vite production build passes

## Live infrastructure

- [ ] one Firebase/Google Cloud project selected
- [ ] Firestore Native Standard database created
- [ ] Firestore rules deployed
- [ ] Firestore composite indexes deployed/built
- [ ] dedicated API runtime service account exists
- [ ] API deployed as public Node.js 22 Cloud Run function-style service
- [ ] API minimum instances = 0
- [ ] API health URL returns 200
- [ ] production Hosting origin passes CORS
- [ ] frontend built with live API URL
- [ ] Firebase Hosting live URL returns 200

## Live case-study flow

- [ ] CSV upload works on live site
- [ ] cleaned observations persist in live Firestore
- [ ] page reload restores persisted upload
- [ ] overall summary matches the verified dataset
- [ ] partial-month selection remains non-evaluable for contractual SLA
- [ ] single-date filter works
- [ ] date-range filter works
- [ ] service filter works
- [ ] cursor Next/Previous works
- [ ] identical upload returns same upload ID
- [ ] invalid upload shows safe user-facing error

## Responsive/accessibility

- [ ] 414px phone
- [ ] 768px tablet
- [ ] 1024px breakpoint transition
- [ ] 1366px laptop
- [ ] 1920px desktop
- [ ] no page-level horizontal overflow
- [ ] mobile logs are complete record cards
- [ ] focus indicators visible
- [ ] keyboard-only primary flow works
- [ ] reduced-motion behavior preserved

## README/submission

- [ ] GitHub repo URL filled in
- [ ] live application URL filled in
- [ ] live API URL filled in
- [ ] last verified-live timestamp/date recorded
- [ ] architecture explains Hosting → stateless API → Firestore
- [ ] every discovered data-quality issue documented
- [ ] assumptions documented
- [ ] local run instructions documented
- [ ] production redeploy instructions documented
- [ ] “with more time” section remains honest and bounded

## Reviewer defense prompts

Be ready to explain:

- why raw rows cannot be the SLA denominator
- why exact duplicates differ from legitimate multi-agent observations
- why invalid telemetry is not automatically downtime
- availability vs monitoring coverage
- why monthly SLA evaluation is guarded
- why daily aggregates are stored
- why cursor pagination is query-bound
- why browser Firestore access is denied
- why SHA-256 is the upload identity
- why mobile logs become record cards
- why production CORS is explicit
- why the API uses a dedicated runtime service account
