const test = require('node:test');
const assert = require('node:assert/strict');

const { percentileNearestRank } = require('../dist');

test('nearest-rank percentile is explicit, deterministic and does not mutate source', () => {
  const source = [50, 10, 40, 20, 30];
  assert.equal(percentileNearestRank(source, 95), 50);
  assert.equal(percentileNearestRank(source, 50), 30);
  assert.deepEqual(source, [50, 10, 40, 20, 30]);
});

test('percentile returns null for no samples and rejects invalid percentile values', () => {
  assert.equal(percentileNearestRank([], 95), null);
  assert.throws(() => percentileNearestRank([1], 0), RangeError);
  assert.throws(() => percentileNearestRank([1], 101), RangeError);
});
