'use strict';

/**
 * 軽量な間隔反復（SRS）ロジック。
 * SM-2 を簡略化し、「もう一度 / これを復習(OK) / 簡単」の3段階で回す。
 *
 * grade:
 *   'again' … もう一度（間違い / 定着していない）→ 間隔リセット
 *   'good'  … これを復習（思い出せた）        → 間隔を伸ばす
 *   'easy'  … 簡単（余裕で正解）              → 大きく伸ばす
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

/** 新規カードの初期SRS状態。 */
function initialState() {
  return {
    reps: 0,
    lapses: 0,
    interval: 0, // 日数
    ease: DEFAULT_EASE,
    due: null, // 未学習は null（= いつでも復習対象）
    lastReviewed: null,
  };
}

function addDays(fromISO, days) {
  const base = fromISO ? new Date(fromISO) : new Date();
  return new Date(base.getTime() + Math.round(days * DAY_MS)).toISOString();
}

/**
 * 復習結果を反映した新しいSRS状態を返す（純関数）。
 * @param {object} state  現在のSRS状態
 * @param {'again'|'good'|'easy'} grade
 * @param {string} [nowISO]  現在時刻（テスト用に注入可能）
 */
function review(state, grade, nowISO) {
  const now = nowISO || new Date().toISOString();
  const s = { ...initialState(), ...state };

  let { interval, ease, reps, lapses } = s;

  if (grade === 'again') {
    reps = 0;
    lapses += 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
    interval = 0; // 当日中にもう一度
  } else if (grade === 'good') {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 3;
    else interval = Math.max(1, Math.round(interval * ease));
    reps += 1;
  } else if (grade === 'easy') {
    ease = ease + 0.15;
    if (reps === 0) interval = 3;
    else interval = Math.max(1, Math.round(interval * ease * 1.3));
    reps += 1;
  } else {
    throw new Error(`unknown grade: ${grade}`);
  }

  return {
    reps,
    lapses,
    interval,
    ease: Number(ease.toFixed(2)),
    due: addDays(now, interval),
    lastReviewed: now,
  };
}

/** 期限が来ている（=復習すべき）か。未学習(due=null)は常に対象。 */
function isDue(state, nowISO) {
  if (!state || !state.due) return true;
  const now = nowISO ? new Date(nowISO) : new Date();
  return new Date(state.due).getTime() <= now.getTime();
}

/**
 * 定着度スコア（0〜100）。キーワードの習熟表示に使う。
 * reps と interval を材料にした素朴な指標。
 */
function mastery(state) {
  if (!state || state.reps === 0) return 0;
  const byReps = Math.min(1, state.reps / 5);
  const byInterval = Math.min(1, state.interval / 30);
  return Math.round((byReps * 0.5 + byInterval * 0.5) * 100);
}

module.exports = { initialState, review, isDue, mastery, DAY_MS };
