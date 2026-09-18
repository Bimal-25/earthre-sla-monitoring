# Validation Against the Supplied Case-Study CSVs

The correctness core and Phase 2 ingestion/aggregation services were executed against all five CSV files supplied in the assignment package. These values are **validation evidence only**; no seed-specific counts, filenames, service IDs or date ranges are hardcoded into production logic.

| Dataset | Source rows | Exact duplicates removed | Stored observations | Canonical intervals | Unix timestamps | Missing latency | Negative latency | Invalid status | Unresolved intervals |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `monitoring_checks_9d_seed101.csv` | 4,672 | 6 | 4,666 | 4,320 | 70 | 56 | 1 | 1 | 1 |
| `monitoring_checks_12d_seed505.csv` | 6,230 | 8 | 6,222 | 5,760 | 93 | 74 | 1 | 1 | 1 |
| `monitoring_checks_14d_seed202.csv` | 7,269 | 10 | 7,259 | 6,720 | 109 | 87 | 1 | 1 | 0 |
| `monitoring_checks_21d_seed303.csv` | 10,904 | 18 | 10,886 | 10,080 | 163 | 130 | 1 | 1 | 1 |
| `monitoring_checks_30d_seed404.csv` | 15,577 | 24 | 15,553 | 14,400 | 233 | 186 | 1 | 1 | 1 |

The generated canonical interval counts match:

```text
number of observed days × 96 fifteen-minute slots/day × 5 services
```

for each supplied file.

The 14-day seed is a useful reconciliation regression case: its invalid-status observation shares an interval with a valid observation from another agent, so the interval resolves from valid health evidence while retaining the invalid-status quality warning. In the other four supplied seeds, the invalid status leaves one interval unresolved under the documented rules.

All supplied parseable timestamps were on the expected 15-minute cadence, so the supplied files produced zero unassigned observations.

The supplied files are not complete calendar months. The Phase 2 summary service therefore marks their service-level monthly SLA evaluation as non-evaluable while still returning observed operational availability and coverage.

To reproduce the non-persistent profile:

```bash
npm run analyze -- /path/to/monitoring_checks_9d_seed101.csv
```
