'use strict';

const path = require('path');
const express = require('express');
const Store = require('./src/store');

/**
 * キーワード中心の復習サーバー。
 * API はすべてキーワードを主軸に設計している。
 */
function createServer(opts = {}) {
  const store =
    opts.store ||
    new Store({
      dataFile: opts.dataFile || path.join(__dirname, 'data', 'db.json'),
      seedFile: opts.seedFile || path.join(__dirname, 'data', 'seed.json'),
    });

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // --- キーワード（主軸） ---

  // キーワード一覧（期限・件数・定着度つき）
  app.get('/api/keywords', (_req, res) => {
    res.json({ keywords: store.keywordSummaries() });
  });

  // 1キーワードの詳細（紐づくカード＋集計）
  app.get('/api/keywords/:keyword', (req, res) => {
    const keyword = decodeURIComponent(req.params.keyword);
    const items = store.itemsByKeyword(keyword);
    if (items.length === 0) return res.status(404).json({ error: 'keyword not found' });
    const summary = store.keywordSummaries().find((k) => k.keyword === keyword);
    res.json({ keyword, summary, items });
  });

  // --- 復習フィード ---

  // キーワードで絞れる復習フィード。?keyword= と ?all=1（期限外も含む）に対応。
  app.get('/api/feed', (req, res) => {
    const keyword = req.query.keyword ? String(req.query.keyword) : undefined;
    const dueOnly = req.query.all !== '1';
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json({ keyword: keyword || null, dueOnly, cards: store.feed({ keyword, dueOnly, limit }) });
  });

  // --- カード操作 ---

  // 復習結果を記録: { grade: 'again' | 'good' | 'easy' }
  app.post('/api/items/:id/review', (req, res) => {
    const grade = req.body && req.body.grade;
    if (!['again', 'good', 'easy'].includes(grade)) {
      return res.status(400).json({ error: "grade must be 'again', 'good' or 'easy'" });
    }
    const item = store.reviewItem(req.params.id, grade);
    if (!item) return res.status(404).json({ error: 'item not found' });
    res.json({ item });
  });

  // 新規カード追加（キーワード必須で登録を推奨）
  app.post('/api/items', (req, res) => {
    try {
      const item = store.addItem(req.body || {});
      res.status(201).json({ item });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/items/:id', (req, res) => {
    const item = store.getItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'item not found' });
    res.json({ item });
  });

  return { app, store };
}

module.exports = { createServer };

if (require.main === module) {
  const port = process.env.PORT || 3000;
  const { app } = createServer();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`復習サーバー（キーワード中心）: http://localhost:${port}`);
  });
}
