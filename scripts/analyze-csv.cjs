#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const {
  buildCanonicalIntervals,
  deduplicateObservations,
  normalizeObservations,
  parseMonitoringCsv,
  summarizeIntervals,
} = require('../dist');

function usage() {
  console.error('Usage: npm run analyze -- /absolute/or/relative/path/to/file.csv');
}

const requested = process.argv[2];
if (!requested) {
  usage();
  process.exitCode = 1;
} else {
  try {
    const filePath = path.resolve(process.cwd(), requested);
    const csv = fs.readFileSync(filePath, 'utf8');
    const parsed = parseMonitoringCsv(csv);
    const normalized = normalizeObservations(parsed.rows);
    const deduped = deduplicateObservations(normalized);
    const built = buildCanonicalIntervals(deduped);
    const summary = summarizeIntervals(built.intervals);

    const normalizationIssueCounts = {};
    for (const observation of normalized) {
      for (const issue of observation.issues) {
        normalizationIssueCounts[issue.code] =
          (normalizationIssueCounts[issue.code] ?? 0) + 1;
      }
    }

    const perService = built.services.map((service) => {
      const intervals = built.intervals.filter(
        (interval) => interval.serviceId === service.serviceId,
      );
      return {
        ...service,
        ...summarizeIntervals(intervals),
      };
    });

    const output = {
      file: filePath,
      sourceRows: parsed.rows.length,
      deduplicatedObservations: deduped.length,
      exactDuplicateRowsRemoved: parsed.rows.length - deduped.length,
      normalizationIssueCounts,
      unassignedObservations: built.unassignedObservations.length,
      services: built.services,
      window: built.window,
      overall: summary,
      perService,
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
    process.exitCode = 1;
  }
}
