const test = require('node:test');
const assert = require('node:assert');
const app = require('../../index');

test('GET /health répond 200', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const res = await fetch(`http://localhost:${port}/health`);
  assert.strictEqual(res.status, 200);
  server.close();
});