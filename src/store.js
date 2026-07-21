'use strict';

const fs = require('fs');
const path = require('path');
const srs = require('./srs');

/**
 * キーワード中心の復習ストア。
 * カード（item）を保持しつつ、キーワードを主軸に集計・出題する。
 * 永続化は JSON ファイル1枚（依存を増やさない）。
 */
class Store {
  /**
   * @param {object} [opts]
   * @param {string} [opts.dataFile]  永続化先。省略時はメモリのみ。
   * @param {string} [opts.seedFile]  初期データ。dataFile が無い時に読む。
   */
  constructor(opts = {}) {
    this.dataFile = opts.dataFile || null;
    this.items = new Map();
    this._load(opts.seedFile);
  }

  _load(seedFile) {
    let raw = null;
    if (this.dataFile && fs.existsSync(this.dataFile)) {
      raw = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
    } else if (seedFile && fs.existsSync(seedFile)) {
      raw = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    }
    if (Array.isArray(raw)) {
      for (const it of raw) this.items.set(it.id, this._normalize(it));
    }
  }

  _normalize(it) {
    return {
      id: it.id,
      subject: it.subject || '',
      type: it.type || 'tip',
      title: it.title || '',
      body: it.body || '',
      keywords: Array.isArray(it.keywords) ? it.keywords.slice() : [],
      srs: it.srs || srs.initialState(),
    };
  }

  _persist() {
    if (!this.dataFile) return;
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
    fs.writeFileSync(this.dataFile, JSON.stringify([...this.items.values()], null, 2));
  }

  // ---- カード ----

  getItem(id) {
    return this.items.get(id) || null;
  }

  listItems() {
    return [...this.items.values()];
  }

  addItem(input) {
    if (!input || !input.title) throw new Error('title is required');
    const id = input.id || `kw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (this.items.has(id)) throw new Error(`duplicate id: ${id}`);
    const item = this._normalize({ ...input, id });
    this.items.set(id, item);
    this._persist();
    return item;
  }

  /**
   * 復習結果を記録し、SRS状態を更新する。
   * @returns 更新後の item（次回期限つき）
   */
  reviewItem(id, grade, nowISO) {
    const item = this.items.get(id);
    if (!item) return null;
    item.srs = srs.review(item.srs, grade, nowISO);
    this._persist();
    return item;
  }

  // ---- キーワード（主軸） ----

  /**
   * 全キーワードを集計して返す。
   * それぞれ 件数 / 復習期限が来ている件数 / 平均定着度 を持つ。
   * デフォルトは「期限が来ている件数 → 総件数」で降順。
   */
  keywordSummaries(nowISO) {
    const map = new Map();
    for (const item of this.items.values()) {
      for (const kw of item.keywords) {
        if (!map.has(kw)) {
          map.set(kw, { keyword: kw, total: 0, due: 0, subjects: new Set(), masterySum: 0 });
        }
        const agg = map.get(kw);
        agg.total += 1;
        if (srs.isDue(item.srs, nowISO)) agg.due += 1;
        agg.masterySum += srs.mastery(item.srs);
        if (item.subject) agg.subjects.add(item.subject);
      }
    }
    return [...map.values()]
      .map((a) => ({
        keyword: a.keyword,
        total: a.total,
        due: a.due,
        mastery: Math.round(a.masterySum / a.total),
        subjects: [...a.subjects],
      }))
      .sort((x, y) => y.due - x.due || y.total - x.total || x.keyword.localeCompare(y.keyword, 'ja'));
  }

  /** 指定キーワードに紐づくカード一覧。 */
  itemsByKeyword(keyword) {
    return this.listItems().filter((it) => it.keywords.includes(keyword));
  }

  /**
   * 復習フィード。キーワード主軸で「今復習すべきカード」を返す。
   * @param {object} [opts]
   * @param {string} [opts.keyword]  絞り込むキーワード
   * @param {boolean} [opts.dueOnly=true]  期限到来分のみ
   * @param {number} [opts.limit]
   */
  feed(opts = {}) {
    const { keyword, dueOnly = true, limit, nowISO } = opts;
    let items = this.listItems();
    if (keyword) items = items.filter((it) => it.keywords.includes(keyword));
    if (dueOnly) items = items.filter((it) => srs.isDue(it.srs, nowISO));

    // 期限が古い順（=よりやるべき順）、未学習を優先。
    items.sort((a, b) => this._dueRank(a, nowISO) - this._dueRank(b, nowISO));
    if (limit) items = items.slice(0, limit);

    return items.map((it) => this._toCard(it, nowISO));
  }

  _dueRank(item, nowISO) {
    if (!item.srs || !item.srs.due) return -Infinity; // 未学習を最優先
    return new Date(item.srs.due).getTime();
  }

  _toCard(item, nowISO) {
    return {
      ...item,
      due: srs.isDue(item.srs, nowISO),
      mastery: srs.mastery(item.srs),
    };
  }
}

module.exports = Store;
