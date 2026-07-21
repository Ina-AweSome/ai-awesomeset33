'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../server');
const Store = require('../src/store');
const path = require('path');

function freshApp() {
  const store = new Store({ seedFile: path.join(__dirname, '..', 'data', 'seed.json') });
  return createServer({ store }).app;
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

test('GET /api/keywords は期限件数つきで返る', async () => {
  const { server, port } = await listen(freshApp());
  const res = await fetch(`http://localhost:${port}/api/keywords`);
  const body = await res.json();
  assert.ok(Array.isArray(body.keywords));
  const kw = body.keywords.find((k) => k.keyword === '消滅時効');
  assert.ok(kw, '消滅時効 が存在する');
  assert.strictEqual(kw.total, 2); // seed に2件
  assert.strictEqual(kw.due, 2); // 未学習は全て due
  server.close();
});

test('GET /api/feed?keyword= でキーワード絞り込み', async () => {
  const { server, port } = await listen(freshApp());
  const res = await fetch(`http://localhost:${port}/api/feed?keyword=既判力`);
  const body = await res.json();
  assert.strictEqual(body.keyword, '既判力');
  assert.strictEqual(body.cards.length, 2);
  assert.ok(body.cards.every((c) => c.keywords.includes('既判力')));
  server.close();
});

test('復習を記録すると due から外れる', async () => {
  const app = freshApp();
  const { server, port } = await listen(app);
  const base = `http://localhost:${port}`;

  const before = await (await fetch(`${base}/api/feed?keyword=原告適格`)).json();
  const id = before.cards[0].id;

  const rev = await fetch(`${base}/api/items/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grade: 'good' }),
  });
  assert.strictEqual(rev.status, 200);

  const after = await (await fetch(`${base}/api/feed?keyword=原告適格`)).json();
  assert.ok(!after.cards.some((c) => c.id === id), '復習済みは期限フィードから外れる');
  server.close();
});

test('不正な grade は 400', async () => {
  const { server, port } = await listen(freshApp());
  const res = await fetch(`http://localhost:${port}/api/items/gyo-shobunsei/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grade: 'nope' }),
  });
  assert.strictEqual(res.status, 400);
  server.close();
});
