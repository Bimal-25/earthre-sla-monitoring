const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CsvParseError,
  CsvSchemaError,
  parseMonitoringCsv,
} = require('../dist');

const HEADER = 'service_id,service_name,timestamp,status_code,latency,latency_unit,agent,region';

test('parses a standard monitoring CSV row', () => {
  const csv = `${HEADER}\nsvc-auth,auth-api,2025-05-01T00:00:00Z,200,120,ms,agent-1,ap-south-1\n`;
  const parsed = parseMonitoringCsv(csv);

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].sourceRow, 2);
  assert.deepEqual(parsed.rows[0].raw, {
    service_id: 'svc-auth',
    service_name: 'auth-api',
    timestamp: '2025-05-01T00:00:00Z',
    status_code: '200',
    latency: '120',
    latency_unit: 'ms',
    agent: 'agent-1',
    region: 'ap-south-1',
  });
});

test('accepts required headers in a different order and ignores extra columns', () => {
  const csv = [
    'agent,service_name,extra,service_id,timestamp,status_code,latency_unit,latency,region',
    'agent-1,auth-api,ignored,svc-auth,2025-05-01T00:00:00Z,200,ms,120,ap-south-1',
  ].join('\n');

  const parsed = parseMonitoringCsv(csv);
  assert.equal(parsed.rows[0].raw.service_id, 'svc-auth');
  assert.equal(parsed.rows[0].raw.agent, 'agent-1');
});

test('supports BOM, CRLF, commas, escaped quotes and newlines inside quoted fields', () => {
  const csv =
    '\uFEFF' + HEADER + '\r\n' +
    'svc-auth,"auth, \"\"primary\"\"",2025-05-01T00:00:00Z,200,120,ms,agent-1,"ap-\n' +
    'south-1"\r\n';

  const parsed = parseMonitoringCsv(csv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].raw.service_name, 'auth, "primary"');
  assert.equal(parsed.rows[0].raw.region, 'ap-\nsouth-1');
});

test('rejects a missing required header', () => {
  const csv = 'service_id,service_name,timestamp,status_code,latency,latency_unit,agent\n';
  assert.throws(
    () => parseMonitoringCsv(csv),
    (error) => error instanceof CsvSchemaError && /region/.test(error.message),
  );
});

test('rejects duplicate header names', () => {
  const csv = `${HEADER},region\n`;
  assert.throws(
    () => parseMonitoringCsv(csv),
    (error) => error instanceof CsvSchemaError && /Duplicate CSV header/.test(error.message),
  );
});

test('rejects structurally malformed data rows', () => {
  const csv = `${HEADER}\nsvc-auth,auth-api,2025-05-01T00:00:00Z,200,120,ms,agent-1\n`;
  assert.throws(
    () => parseMonitoringCsv(csv),
    (error) =>
      error instanceof CsvParseError &&
      error.recordNumber === 2 &&
      /expected 8/.test(error.message),
  );
});

test('rejects an unclosed quoted field', () => {
  const csv = `${HEADER}\nsvc-auth,"auth-api,2025-05-01T00:00:00Z,200,120,ms,agent-1,ap-south-1`;
  assert.throws(
    () => parseMonitoringCsv(csv),
    (error) => error instanceof CsvParseError && /Unclosed quoted field/.test(error.message),
  );
});

test('rejects an empty CSV', () => {
  assert.throws(
    () => parseMonitoringCsv('  \n'),
    (error) => error instanceof CsvSchemaError && /empty/.test(error.message),
  );
});
