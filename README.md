# 復習サーバー（キーワード中心）

司法試験・法律学習向けの「復習フィード」をキーワード中心に展開した復習サーバーです。
科目タブではなく **キーワード（消滅時効・意思表示・原告適格・既判力 …）を主軸** に、
今日復習すべきカードを間隔反復（SRS）で出題します。

## 特徴

- **キーワード主軸のナビ** — 上部チップでキーワードを選ぶと、そのキーワードに紐づく
  復習カードだけが並ぶ。各チップには「今復習すべき件数」を表示。
- **間隔反復（SRS）** — `もう一度 / これを復習 / 覚えた` の3段階でカードの次回期限を調整。
- **横断復習** — 「✨ おすすめ」は全キーワードを横断して期限到来分を出題。
- **カードから逆引き** — カード内のキーワードタグを押すと、そのキーワードの復習に移動。

## 起動

```bash
npm install
npm start          # http://localhost:3000
```

初回は `data/seed.json` を読み込み、以降は `data/db.json` に永続化します。

## テスト

```bash
npm test           # SRSロジック + API のテスト
```

## API（すべてキーワード主軸）

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/keywords` | 全キーワード一覧（件数 / 期限件数 / 定着度） |
| GET | `/api/keywords/:keyword` | 1キーワードの詳細と紐づくカード |
| GET | `/api/feed?keyword=&all=1&limit=` | 復習フィード（`keyword` で絞り込み、`all=1` で期限外も） |
| GET | `/api/items/:id` | カード取得 |
| POST | `/api/items` | カード追加（`keywords` 必須推奨） |
| POST | `/api/items/:id/review` | 復習結果を記録（`{"grade":"again\|good\|easy"}`） |

### 例

```bash
# キーワード一覧（復習すべき件数が多い順）
curl localhost:3000/api/keywords

# 「既判力」の復習フィード
curl 'localhost:3000/api/feed?keyword=既判力'

# 復習結果を記録（間隔が伸びる）
curl -X POST localhost:3000/api/items/minso-kihanryoku-jiteki/review \
  -H 'Content-Type: application/json' -d '{"grade":"good"}'
```

## 構成

```
server.js          Express サーバー（キーワード主軸のルーティング）
src/store.js       カード保持 + キーワード集計 + 出題ロジック
src/srs.js         間隔反復（SM-2 簡略版）
data/seed.json     初期カード（法律論点 + キーワード）
public/            キーワード中心の復習フィード UI
test/              テスト
```
