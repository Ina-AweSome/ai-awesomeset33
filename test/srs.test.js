'use strict';

const test = require('node:test');
const assert = require('node:assert');
const srs = require('../src/srs');

test('新規カードは常に復習対象', () => {
  const s = srs.initialState();
  assert.strictEqual(srs.isDue(s), true);
  assert.strictEqual(srs.mastery(s), 0);
});

test('good で間隔が伸び、期限が未来になる', () => {
  const now = '2026-07-21T00:00:00.000Z';
  const s1 = srs.review(srs.initialState(), 'good', now);
  assert.strictEqual(s1.reps, 1);
  assert.strictEqual(s1.interval, 1);
  assert.strictEqual(srs.isDue(s1, now), false);

  const s2 = srs.review(s1, 'good', now);
  assert.strictEqual(s2.interval, 3);
});

test('again は間隔をリセットし lapse を増やす', () => {
  const now = '2026-07-21T00:00:00.000Z';
  let s = srs.review(srs.initialState(), 'good', now);
  s = srs.review(s, 'good', now);
  const after = srs.review(s, 'again', now);
  assert.strictEqual(after.interval, 0);
  assert.strictEqual(after.reps, 0);
  assert.strictEqual(after.lapses, 1);
  assert.strictEqual(srs.isDue(after, now), true);
});

test('easy は good より大きく伸ばす', () => {
  const now = '2026-07-21T00:00:00.000Z';
  const good = srs.review(srs.initialState(), 'good', now);
  const easy = srs.review(srs.initialState(), 'easy', now);
  assert.ok(easy.interval >= good.interval);
});
