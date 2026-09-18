const test = require('node:test');
const assert = require('node:assert/strict');

const {
  InMemoryUploadRepository,
  processCsvUpload,
  getUploadSummary,
  getUploadLogs,
} = require('../dist');

function makeCsv() {
  return [
    'service_id,service_name,timestamp,status_code,latency,latency_unit,agent,region',
    'svc-a,alpha,2025-05-08T00:00:00Z,200,100,ms,a1,r1',
    'svc-b,beta,2025-05-08T00:00:00Z,200,200,ms,a1,r1',
    'svc-a,alpha,2025-05-08T00:15:00Z,503,300,ms,a1,r1',
    'svc-b,beta,2025-05-08T00:15:00Z,200,400,ms,a1,r1',
    'svc-a,alpha,2025-05-08T00:30:00Z,200,500,ms,a1,r1',
    'svc-b,beta,2025-05-08T00:30:00Z,999,600,ms,a1,r1',
  ].join('\n');
}

async function processedRepository() {
  const repository = new InMemoryUploadRepository();
  const result = await processCsvUpload({
    bytes: new TextEncoder().encode(makeCsv()),
    filenameHeader: 'sample.csv',
    repository,
    maxCsvRows: 25_000,
  });
  return { repository, upload: result.upload };
}

test('summary aggregates stored daily stats and does not call a partial period a monthly SLA decision', async () => {
  const { repository, upload } = await processedRepository();
  const summary = await getUploadSummary({
    repository,
    uploadId: upload.uploadId,
    slaTargetPercent: 99.9,
  });

  assert.deepEqual(summary.period, {
    from: '2025-05-08',
    to: '2025-05-08',
    completeCalendarMonth: false,
    uploadCoversPeriodBoundaries: false,
  });
  assert.equal(summary.overall.expectedIntervals, 6);
  assert.equal(summary.overall.healthyIntervals, 4);
  assert.equal(summary.overall.downIntervals, 1);
  assert.equal(summary.overall.unknownIntervals, 1);
  assert.equal(summary.overall.p95LatencyMs, 600);
  assert.equal(summary.services.length, 2);
  assert.equal(summary.services[0].sla.evaluable, false);
  assert.match(summary.services[0].sla.reason, /not a complete calendar month/i);
});

test('logs support stable cursor pagination and bind a cursor to its query', async () => {
  const { repository, upload } = await processedRepository();

  const first = await getUploadLogs({
    repository,
    uploadId: upload.uploadId,
    from: '2025-05-08',
    pageSize: 2,
  });

  assert.equal(first.items.length, 2);
  assert.equal(first.hasMore, true);
  assert.ok(first.nextCursor);
  assert.ok(!('sortKey' in first.items[0]));

  const second = await getUploadLogs({
    repository,
    uploadId: upload.uploadId,
    from: '2025-05-08',
    pageSize: 2,
    cursor: first.nextCursor,
  });

  assert.equal(second.items.length, 2);
  assert.notEqual(second.items[0].observationId, first.items[0].observationId);

  await assert.rejects(
    getUploadLogs({
      repository,
      uploadId: upload.uploadId,
      from: '2025-05-08',
      serviceId: 'svc-a',
      pageSize: 2,
      cursor: first.nextCursor,
    }),
    (error) => error.code === 'INVALID_CURSOR',
  );
});

test('logs can be filtered to one known service', async () => {
  const { repository, upload } = await processedRepository();
  const logs = await getUploadLogs({
    repository,
    uploadId: upload.uploadId,
    from: '2025-05-08',
    serviceId: 'svc-a',
    pageSize: 100,
  });

  assert.equal(logs.items.length, 3);
  assert.ok(logs.items.every((item) => item.serviceId === 'svc-a'));
});

test('summary rejects dates outside the observed upload window', async () => {
  const { repository, upload } = await processedRepository();

  await assert.rejects(
    getUploadSummary({
      repository,
      uploadId: upload.uploadId,
      from: '2025-05-07',
      to: '2025-05-08',
      slaTargetPercent: 99.9,
    }),
    (error) => error.code === 'DATE_OUT_OF_UPLOAD_RANGE',
  );
});
