const test = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');
const app = require('../../index');

test('GET /health répond 200 avec status ok', async () => {
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { status: 'ok' });
  } finally {
    server.close();
  }
});