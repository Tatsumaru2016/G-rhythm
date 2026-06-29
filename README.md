# G.RHYTHM

4レーン本格リズムゲーム — ブラウザでプレイ可能

## 特徴

- **4レーン** — D / F / J / K キー（タッチ操作にも対応）
- **本格的な判定** — PERFECT / GREAT / GOOD / BAD / MISS
- **ロングノート** — ホールドノーツ対応
- **演出** — パーティクル、レーン発光、スクリーンシェイク、パーフェクトフラッシュ
- **Web Audio API** — オーディオクロックによる高精度タイミング同期
- **3曲収録** — NORMAL / HARD / EXTREME 難易度
- **カスタム音楽** — 自分の MP3 / WAV / OGG / FLAC などを読み込んでプレイ

## 起動方法

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開いてプレイ。

## 操作

| レーン | キー | 色 |
|--------|------|-----|
| 左 | D | ピンク |
| 左中 | F | シアン |
| 右中 | J | パープル |
| 右 | K | ゴールド |

スマートフォンでは画面下部の4分割エリアをタッチ。

## カスタム音楽

1. SONG SELECT 画面で **YOUR MUSIC** カードをクリック
2. 端末内の音声ファイルを選択（MP3, WAV, OGG, FLAC, M4A など）
3. BPM・OFFSET・ノーツ密度を調整（譜面は自動生成）
4. PLAY でプレイ開始

音声はブラウザ内でデコードされ、外部にアップロードされることはありません。

## ビルド

```bash
npm run build
npm run preview
```

`dist/` に静的ファイルが生成されます。任意のWebサーバーにデプロイ可能です。

型チェック付きビルド: `npm run build:check`

## 公開サイト

GitHub Pages で自動デプロイされます。

- 本番: https://tatsumaru2016.github.io/G-rhythm/
- リポジトリ: https://github.com/Tatsumaru2016/G-rhythm

ダンサーモデル（約1.3GB）は GitHub リポジトリ上にバックアップされ、本番サイトでは `raw.githubusercontent.com` から読み込みます（初回の「ダンス会場設営中」に時間がかかります）。

## 技術スタック

- TypeScript + Vite
- HTML5 Canvas 2D
- Web Audio API（プロシージャルBGM・SE）
- JSON譜面フォーマット

## 譜面フォーマット

```json
{
  "id": "song-id",
  "title": "SONG NAME",
  "artist": "Artist",
  "bpm": 140,
  "offset": 1.0,
  "lpb": 4,
  "difficulty": "NORMAL",
  "level": 5,
  "notes": [
    { "lane": 0, "beat": 0, "type": "tap" },
    { "lane": 0, "beat": 16, "type": "hold", "duration": 8 }
  ]
}
```

`src/charts/` に新しい JSON を追加し、`src/data/charts.ts` に登録してください。
