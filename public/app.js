'use strict';

// キーワード中心の復習フィード（フロント）。
// 状態は「選択中キーワード」と「期限外も表示するか」の2つだけ。

const state = {
  keyword: null, // null = おすすめ（全キーワード横断）
  showAll: false,
};

/**
 * メモの飛び先設定。
 * GoodNotes は「特定ノート（本日のノート）」を URL で直接開く仕組みを
 * 公式には持たない（新規作成/インポート系とアプリ起動のみ）。
 * そのため「本日のノートに確実に飛ばす」には iOS ショートカット経由が現実解。
 *
 *   mode: 'goodnotes' … GoodNotes アプリを開く（本日のノートは手動で選択）
 *   mode: 'shortcut'  … iOS ショートカット経由で本日のノートを開く/追記（推奨）
 *
 * ショートカット側で「本日のノートを開く（必要なら input を追記）」を組み、
 * その名前を shortcutName に設定する。
 */
const MEMO = {
  mode: 'goodnotes',
  shortcutName: '本日のノート',
  urlFor(card) {
    if (this.mode === 'shortcut') {
      const text = `【${card.title}】\n${card.body}\n#${card.keywords.join(' #')}`;
      return (
        'shortcuts://run-shortcut?name=' +
        encodeURIComponent(this.shortcutName) +
        '&input=text&text=' +
        encodeURIComponent(text)
      );
    }
    // GoodNotes アプリを開く（本日のノートは URL で直接指定できない）
    return 'goodnotes://';
  },
};

const el = (id) => document.getElementById(id);

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function fmtDate(d) {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()}（${days[d.getDay()]}）`;
}

// --- キーワードチップ（主軸ナビ） ---

async function renderKeywords() {
  const { keywords } = await api('/api/keywords');
  const bar = el('keyword-bar');
  bar.innerHTML = '';

  // 「おすすめ」= キーワード横断
  bar.appendChild(
    chip('✨ おすすめ', null, { rec: true, active: state.keyword === null })
  );

  for (const k of keywords) {
    bar.appendChild(
      chip(k.keyword, k.keyword, { count: k.due, active: state.keyword === k.keyword })
    );
  }
}

function chip(label, keyword, { count, active, rec } = {}) {
  const b = document.createElement('button');
  b.className = 'kw-chip' + (active ? ' active' : '') + (rec ? ' rec' : '');
  b.textContent = label;
  if (typeof count === 'number' && count > 0) {
    const c = document.createElement('span');
    c.className = 'count';
    c.textContent = count;
    b.appendChild(c);
  }
  b.addEventListener('click', () => {
    state.keyword = keyword;
    render();
  });
  return b;
}

// --- フィード ---

async function renderFeed() {
  const params = new URLSearchParams();
  if (state.keyword) params.set('keyword', state.keyword);
  if (state.showAll) params.set('all', '1');
  const { cards } = await api('/api/feed?' + params.toString());

  el('feed-title').textContent = state.keyword
    ? `キーワード：${state.keyword}`
    : 'おすすめの復習';

  const feed = el('feed');
  feed.innerHTML = '';
  el('empty').hidden = cards.length > 0;

  for (const card of cards) feed.appendChild(renderCard(card));
}

function renderCard(card) {
  const wrap = document.createElement('article');
  wrap.className = 'card';

  const isTodo = card.type === 'todo';
  const done = card.srs && card.srs.reps > 0;

  const top = document.createElement('div');
  top.className = 'card-top';
  top.innerHTML =
    `<span class="badge ${isTodo ? 'todo' : 'tip'}">` +
    `<span class="dot">${isTodo ? '🏁' : '💡'}</span>${isTodo ? '今日やる' : 'コツ'}</span>` +
    (done ? `<span class="status-done">✓ 済</span>` : '') +
    `<span class="card-subject">${card.subject}</span>`;
  wrap.appendChild(top);

  const h = document.createElement('h3');
  h.textContent = card.title;
  wrap.appendChild(h);

  const p = document.createElement('p');
  p.textContent = card.body;
  wrap.appendChild(p);

  // キーワードタグ（クリックでそのキーワードに移動）
  const tags = document.createElement('div');
  tags.className = 'kw-tags';
  for (const kw of card.keywords) {
    const t = document.createElement('button');
    t.className = 'kw-tag';
    t.textContent = kw;
    t.addEventListener('click', () => {
      state.keyword = kw;
      render();
    });
    tags.appendChild(t);
  }
  wrap.appendChild(tags);

  if (card.mastery > 0) {
    const m = document.createElement('div');
    m.className = 'mastery';
    m.innerHTML = `<span style="width:${card.mastery}%"></span>`;
    wrap.appendChild(m);
  }

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const again = document.createElement('button');
  again.className = 'btn again';
  again.textContent = '🔁 もう一度';
  again.addEventListener('click', () => review(card.id, 'again'));

  const good = document.createElement('button');
  good.className = 'btn good';
  good.textContent = done ? '✓ 覚えた' : '▶ これを復習';
  good.addEventListener('click', () => review(card.id, 'good'));

  const memo = document.createElement('a');
  memo.className = 'btn memo';
  memo.textContent = '📝 メモ';
  memo.href = MEMO.urlFor(card);
  memo.title =
    MEMO.mode === 'shortcut'
      ? `ショートカット「${MEMO.shortcutName}」で本日のノートに追記`
      : 'GoodNotes を開く';

  actions.append(again, good, memo);
  wrap.appendChild(actions);
  return wrap;
}

async function review(id, grade) {
  await api(`/api/items/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grade }),
  });
  render();
}

// --- 全体 ---

async function render() {
  try {
    await Promise.all([renderKeywords(), renderFeed()]);
  } catch (err) {
    console.error(err);
  }
}

el('date').textContent = fmtDate(new Date());
el('reload').addEventListener('click', render);
el('all-toggle').addEventListener('change', (e) => {
  state.showAll = e.target.checked;
  renderFeed();
});

render();
