# Disthex

同じ端末でふたり対戦できる Disthex のブラウザ版。React + TypeScript + Vite による静的アプリです。サーバー、アカウント、DB は使用しません。

Game design: **airtoxin**, 2017.

## ルールの根拠

- 作者の一次ルール: https://github.com/airtoxin/my-games/blob/master/Disthex/rule.md
- 作者とのプレイ記録（「直前」の隣接制約の確認）: https://www.gamers-jp.com/playgame/archives/001814.html
- 青が上下、赤が左右の対辺を自分の石でつなぐと勝利。
- 空きマスに交互に1石を置く。相手の**直前の着手**に隣接する6マスには置けない。それ以前の石による恒久的な制約はない。
- 初手後、2番手は色交換を選べる。石とゴールを動かさずプレイヤーと色の対応を交換する。赤の着手から続行し、初手の隣接制約は維持する。
- 7×7（推奨）、9×9、11×11に対応。

**合法手がないときはパス:** 2026-10-31 に作者本人が確認。空きマスがすべて隣接禁止のときだけパスし、手番を相手へ渡す。直前ターンがパスなら隣接禁止はなく、次の置石で新たな制約が生じる。任意パスは不可。パスも棋譜・Undo/Redo・保存復元の対象とする。

## 開発

```sh
npm ci
npm run dev
```

Node.js 22.17.1 で検証。依存関係のバージョンは package-lock.json に固定。

```sh
npm test
npm run lint
npm run build
npm run test:e2e
```

ブラウザ検証にはインストール済み Microsoft Edge を headless で使用。GUI の表示やマウス・キーボードの奪取は行わない。PC (1440×1000) と iPhone 13 相当の画面で走る。

公開済み URL の検証は環境変数 `BASE_URL` にその正確な URL を指定して `npm run test:e2e` を実行する。

## 実装

- `src/game.ts`: 不変のルールエンジン、BFSでの勝利経路、swap、棋譜の再生・分岐、保存データの検証。
- `src/App.tsx` / `src/Board.tsx`: 日本語 UI、合法手と隣接禁止の表示、選択→確定、キーボード操作、棋譜、リセット確認、再戦。
- `src/Modal.tsx`: ネイティブ dialog によるフォーカストラップとフォーカス復帰。
- `src/game.test.ts`: 規則と状態管理の単体テスト。
- `tests/game.spec.ts`: 対局完走、勝利、swap、履歴、保存復元、サイズ、キーボード、画面幅の E2E テスト。

対局はこのブラウザの `localStorage` に `disthex.game.v1` として保存する。通信・ユーザー間共有はしない。フォントは Google Fonts と端末のフォールバックフォントを使用。

## リポジトリと公開

Canonical repository: `C:\Users\OWNER\projects\disthex`

作業ブランチ: `feat/playable-disthex`

Vercel の公開先: `airtoxins-projects` (`team_xmtKzQwHNxgdaDB432I1eQkQ`) 内の新規 `disthex` プロジェクト。既存プロジェクトを流用しない。

Vercel API の既存接続を使用して公開する。対象チームへの同意は確認済み。新規プロジェクト `disthex` の ID は `prj_pJtdzNpUkKqlUCsFAxryA9BNI2O0`。本番デプロイが READY になった後、実際に割り当てられた公開 URL で同じ E2E を実行する。

秘密値・`.env`・`.git`・個人ファイル・テスト成果物は公開対象に含めない。GitHub の公開リポジトリは作成しない。

## 最終レビューの検証記録（公開前）

単体20件、headless Edge のE2E20件（PC10件・スマートフォン10件）が通過。型チェック・本番build・lintも通過。

7/9/11各盤で実際の選択・着手・勝利を確認。swap後の色と手番、直前石の隣接制限、Undo/Redo、途中で戻した棋譜の再読込、取消後の保存維持、分岐後のRedo消去、不正な保存データからの回復も確認。作者確認済みの48手・パス・49石目の勝利、パスのUndo/Redo、パス直後の再読込も検証。全E2Eで初期ロードから console error / pageerror を監視し0件。

本番依存の `npm audit --omit=dev` は0件。開発用 lint 依存の minimatch に moderate の既知指摘があり、公開bundleには含まれない。
