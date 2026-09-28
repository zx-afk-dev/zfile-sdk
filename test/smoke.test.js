const test = require('node:test');
const assert = require('node:assert/strict');
const ZFile = require('../');

test('exports the ZFile client', () => {
  const client = new ZFile();
  assert.equal(typeof client.upload, 'function');
  assert.equal(typeof client.uploadBuffer, 'function');
  assert.equal(client.baseUrl, 'https://zfile.web.id');
});
