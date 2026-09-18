const test = require('node:test');
const assert = require('node:assert/strict');
const { median } = require('../dist');

test('median handles empty, odd and even input without mutating source', () => {
  assert.equal(median([]), null);
  const odd = [9, 1, 5];
  assert.equal(median(odd), 5);
  assert.deepEqual(odd, [9, 1, 5]);
  assert.equal(median([10, 20, 30, 40]), 25);
});
