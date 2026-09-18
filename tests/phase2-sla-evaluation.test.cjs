const test = require('node:test');
const assert = require('node:assert/strict');

const {
  InMemoryUploadRepository,
  getUploadSummary,
} = require('../dist');

async function seedFullMonth({ resolved = 2976, healthy = 2974, down = 2 }) {
  const repository = new InMemoryUploadRepository();
  const uploadId = 'a'.repeat(64);
  const now = '2026-09-17T00:00:00.000Z';
  const claim = await repository.claimUpload({
    uploadId,
    fileHash: uploadId,
    filename: 'january.csv',
    nowUtc: now,
  });

  const upload = {
    ...claim.upload,
    status: 'complete',
    updatedAt: now,
    processedAt: now,
    rangeStartUtc: '2025-01-01T00:00:00.000Z',
    rangeEndUtc: '2025-01-31T23:45:00.000Z',
    rangeStartDate: '2025-01-01',
    rangeEndDate: '2025-01-31',
    services: [{ serviceId: 'svc-a', serviceName: 'alpha' }],
    sourceRowCount: 2976,
    storedObservationCount: 2976,
    overall: null,
  };

  const unknown = 2976 - resolved;
  const stat = {
    dailyStatId: 'synthetic-month',
    uploadId,
    date: '2025-01-01',
    serviceId: 'svc-a',
    serviceName: 'alpha',
    expectedIntervals: 2976,
    healthyIntervals: healthy,
    downIntervals: down,
    unknownIntervals: unknown,
    conflictedIntervals: 0,
    resolvedIntervals: resolved,
    unresolvedIntervals: unknown,
    detectedDowntimeMinutes: down * 15,
    latencySamplesMs: [100, 200, 300],
    issueCounts: {},
    intervalStateCounts: {
      healthy,
      down,
      unknown,
      conflicted: 0,
    },
  };

  await repository.completeUpload(upload, [], [stat]);
  return { repository, uploadId };
}

test('a complete calendar month with complete monitoring coverage becomes SLA-evaluable per service', async () => {
  const { repository, uploadId } = await seedFullMonth({});
  const summary = await getUploadSummary({
    repository,
    uploadId,
    from: '2025-01-01',
    to: '2025-01-31',
    slaTargetPercent: 99.9,
  });

  assert.equal(summary.period.completeCalendarMonth, true);
  assert.equal(summary.period.uploadCoversPeriodBoundaries, true);
  assert.equal(summary.services[0].sla.evaluable, true);
  assert.equal(summary.services[0].sla.observedTargetMet, true);
});

test('a full calendar month remains non-evaluable when service coverage is incomplete', async () => {
  const { repository, uploadId } = await seedFullMonth({
    resolved: 2975,
    healthy: 2973,
    down: 2,
  });
  const summary = await getUploadSummary({
    repository,
    uploadId,
    from: '2025-01-01',
    to: '2025-01-31',
    slaTargetPercent: 99.9,
  });

  assert.equal(summary.services[0].sla.evaluable, false);
  assert.match(summary.services[0].sla.reason, /coverage is incomplete/i);
});
