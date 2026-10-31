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

## CPU対戦（この作業ブランチではローカル検証のみ）

`feat/local-cpu-opponent` に端末内CPU戦を追加。今回の作業ではデプロイ・push・Vercel変更を行わない。公開の承認は別途待機する。

- 既存のふたり対戦を残し、対戦モード・人間の先手/後手・CPUの読みを選択。
- 「気軽に」120ms / 深さ2・候補7、「じっくり」450ms / 深さ3・候補10、「深く読む」1200ms / 深さ5・候補14が探索上限。実際の完成深度は局面と端末速度に依存。
- CPUは反復深化・αβ探索。Dijkstraで求める接続に必要な空きマス数と中央性を評価し、直前手の禁止領域を一時的コストとして扱う。即勝ちを先に確認し、相手の即勝ちを隣接禁止で阻止する手を候補から落とさない。中央の初手にはswapを選ぶ簡単な定石を使用。
- 候補を絞る選択的探索であり、完全読みや最善手、競技的な強さは保証しない。学習モデル・LLM API・課金・バックエンドは不使用。
- Module Workerで探索し、メインスレッドを止めない。探索内の締切に加え、予算+2000msの応答監視でWorkerを停止できる。失敗時は画面から再開可能。
- 設定・リセット・Undo・確認画面を開くとWorkerを終了。request ID、取消フラグ、対局オブジェクトの一致で古い応答を破棄する。再読込は保存済み局面から必要なCPU手を一度だけ再開する。
- swapは色の所有権を交換する。CPU戦では人間/CPUどちらの合法手なしも自動パスし、次手の隣接禁止を解除する。
- CPU戦のUndoは、人間の最後の判断の直前まで戻る。後手の人間がまだ判断していないCPU初手は消さない。Redoは次の人間の判断または終局まで進む。
- 保存形式はversion 2（対局+設定）へ拡張。既存のversion 1はふたり対戦として読み込む。

主要追加ファイル: `src/ai.ts`, `src/ai.worker.ts`, `src/useCpuTurn.ts`, `src/match.ts`。テストは `src/ai.test.ts`, `tests/cpu.spec.ts`。競合テストには意図的に遅延応答するテスト用Workerを使い、別途実Workerで全盤サイズ・先後・swap・対局完走を検証する。

CPU追加の最終検証: 単体33件（既存20+CPU/状態管理13）、ローカル本番ビルド `http://127.0.0.1:4174` のE2E46件（PC23+スマホ23）すべて通過。型チェック、lint、build通過。初期ロードからのconsole error/pageerrorは0件。11×11・深い探索中にルール画面を開いて操作でき、思考を停止・再開できることも確認した。

実機スマホとSafariは未検証。強さの人間との比較・Elo評価は未実施。CPU機能の公開環境での検証は未実施（この作業では公開を許可されていないため）。
