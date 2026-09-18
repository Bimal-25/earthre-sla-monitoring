# Verification Report

## Final automated gate before Phase 4

The final Phase 3 source was verified under Node.js 22 with the combined project command:

```bash
npm run check:all
```

Recorded result:

```text
Backend/domain/API tests     61 / 61 PASS
Frontend test files           5 / 5  PASS
Frontend tests               11 / 11 PASS
Backend TypeScript                  PASS
Backend build                       PASS
Frontend TypeScript                 PASS
Vite production build               PASS
```

The final Vite build completed successfully after the responsive log-card redesign.

## Real case-study regression

The 9-day dataset revalidated the frozen correctness result after the persistence/API work:

```text
source rows                4,672
stored observations        4,666
canonical intervals        4,320
healthy                    4,278
down                          41
unknown                        1
availability              99.05070618198657%
coverage                  99.97685185185186%
downtime                     615 minutes
```

## Firestore Emulator integration — verified

Environment used by the project owner:

```text
Node.js 22.23.2
Java 21
Firebase CLI 15.30.2
Firestore Emulator 127.0.0.1:8085
API localhost:8080
```

Verified manually through the real API + Firestore emulator:

- health endpoint
- CSV upload persisted to Firestore
- upload metadata re-query
- summary re-query
- `dailyStats` and `observations` subcollections visible in Emulator UI
- unfiltered logs page 1 + page 2 cursor continuation
- service-filtered logs + filtered cursor continuation
- duplicate upload returns same SHA-256 ID with `alreadyProcessed=true`

## Phase 3 frontend verification — verified

Automated frontend coverage includes:

- API query encoding and safe filename headers
- intentional fetch cancellation remains `AbortError` rather than a false network failure
- single-date/range query mapping and validation
- operational display formatters
- collapsible summary + partial-month notice
- logs normalized values and pagination controls

Manual interaction QA passed:

```text
Dashboard restore             PASS
Collapse / expand             PASS
Single-date filter            PASS
Date-range filter             PASS
Latest day                    PASS
Entire upload                 PASS
Service filter                PASS
Rows-per-page                 PASS
Next / Previous               PASS
Same-file re-upload           PASS
Invalid-upload recovery       PASS
Keyboard navigation           PASS
Mobile 414px                  PASS
Tablet 768px                  PASS
Desktop                       PASS
Console/runtime errors        NONE during normal flow
```

## Responsive presentation — verified

The final responsive design keeps desktop tables at >=1024 CSS px and presents service/log information as complete record cards on narrower tablet/mobile viewports. Final mobile screenshots confirmed the last log record, page summary, Previous/Next controls, and bottom spacing are reachable without page-level horizontal clipping.

## Phase 4 verification boundary

This report proves the local/domain/API/frontend implementation. Phase 4 adds real Google Cloud/Firebase deployment and a second live smoke-test record. The repository does not claim a production deployment until `deploy/05-smoke-test.ps1` passes against the live URLs and `docs/LIVE_DEPLOYMENT.md` is generated.
