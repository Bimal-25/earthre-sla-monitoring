const test = require('node:test');
const assert = require('node:assert/strict');

const {
  InMemoryUploadRepository,
  processCsvUpload,
  sha256Hex,
} = require('../dist');

const CSV = [
  'service_id,service_name,timestamp,status_code,latency,latency_unit,agent,region',
  'svc-a,alpha,2025-01-02T00:00:00Z,200,100,ms,agent-1,us-east',
  'svc-a,alpha,2025-01-02T00:00:00Z,200,100,ms,agent-1,us-east',
  'svc-a,alpha,2025-01-02T00:00:00Z,200,0.12,s,agent-2,eu-west',
  'svc-a,alpha,2025-01-02T00:15:00Z,503,250,ms,agent-1,us-east',
  'svc-b,beta,2025-01-02T00:00:00Z,200,,ms,agent-1,us-east',
  'svc-b,beta,2025-01-02T00:15:00Z,999,90,ms,agent-1,us-east',
].join('\n');

function bytes(text) {
  return new TextEncoder().encode(text);
}

test('processes, persists and idempotently reuses an identical CSV upload', async () => {
  const repository = new InMemoryUploadRepository();
  const clockValues = [
    new Date('2026-09-17T08:00:00.000Z'),
    new Date('2026-09-17T08:00:01.000Z'),
  ];
  let clockIndex = 0;

  const first = await processCsvUpload({
    bytes: bytes(CSV),
    filenameHeader: 'checks.csv',
    repository,
    maxCsvRows: 25_000,
    now: () => clockValues[Math.min(clockIndex++, clockValues.length - 1)],
  });

  assert.equal(first.alreadyProcessed, false);
  assert.equal(first.upload.status, 'complete');
  assert.match(first.upload.uploadId, /^[a-f0-9]{64}$/);
  assert.equal(first.upload.sourceRowCount, 6);
  assert.equal(first.upload.storedObservationCount, 5);
  assert.equal(first.upload.exactDuplicateRowsRemoved, 1);
  assert.equal(first.upload.issueCounts.EXACT_DUPLICATE, 1);
  assert.equal(first.upload.issueCounts.MISSING_LATENCY, 1);
  assert.equal(first.upload.issueCounts.INVALID_HTTP_STATUS, 1);
  assert.equal(first.upload.rangeStartUtc, '2025-01-02T00:00:00.000Z');
  assert.equal(first.upload.rangeEndUtc, '2025-01-02T00:15:00.000Z');
  assert.equal(first.upload.overall.expectedIntervals, 4);
  assert.equal(first.upload.overall.healthyIntervals, 2);
  assert.equal(first.upload.overall.downIntervals, 1);
  assert.equal(first.upload.overall.unknownIntervals, 1);

  const persisted = await repository.getUpload(first.upload.uploadId);
  assert.deepEqual(persisted, first.upload);

  const second = await processCsvUpload({
    bytes: bytes(CSV),
    filenameHeader: 'same-content.csv',
    repository,
    maxCsvRows: 25_000,
  });

  assert.equal(second.alreadyProcessed, true);
  assert.equal(second.upload.uploadId, first.upload.uploadId);
  // Idempotency is content-based. The original provenance name remains the
  // name associated with the completed upload.
  assert.equal(second.upload.filename, 'checks.csv');
});

test('failed validation is recorded against the content hash and can be retried', async () => {
  const repository = new InMemoryUploadRepository();
  const invalid = bytes('wrong,headers\n1,2');
  const uploadId = await sha256Hex(invalid);

  await assert.rejects(
    processCsvUpload({
      bytes: invalid,
      filenameHeader: 'bad.csv',
      repository,
      maxCsvRows: 25_000,
    }),
    (error) => error.code === 'INVALID_CSV' && error.statusCode === 422,
  );

  const failed = await repository.getUpload(uploadId);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.failure.code, 'INVALID_CSV');
});

test('rejects header-only CSVs at the application boundary', async () => {
  const repository = new InMemoryUploadRepository();
  const headerOnly = bytes(
    'service_id,service_name,timestamp,status_code,latency,latency_unit,agent,region\n',
  );

  await assert.rejects(
    processCsvUpload({
      bytes: headerOnly,
      filenameHeader: 'empty.csv',
      repository,
      maxCsvRows: 25_000,
    }),
    (error) => error.code === 'EMPTY_DATASET' && error.statusCode === 422,
  );
});

test('enforces CSV row limits before expensive interval persistence', async () => {
  const repository = new InMemoryUploadRepository();

  await assert.rejects(
    processCsvUpload({
      bytes: bytes(CSV),
      filenameHeader: 'checks.csv',
      repository,
      maxCsvRows: 5,
    }),
    (error) => error.code === 'ROW_LIMIT_EXCEEDED' && error.statusCode === 413,
  );
});
