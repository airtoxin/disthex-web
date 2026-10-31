# Disthex

作者 airtoxin による Disthex のブラウザ版。React / TypeScript / Vite の静的アプリで、同じ端末の2人対戦と端末内CPU対戦に対応します。サーバー、アカウント、DB、学習モデル、外部AI APIは使いません。

## ブランチと公開状態

- `main` / `baseline/cpu-v1`: 公開中のCPU版 `363d2eaa11b933b5617507818d074a41fb37d3ae`。
- `feat/disthex-global-search`: AI強化の実装・比較用ブランチ。**この強化版は未デプロイです。**
- 公開サイト: https://disthex.vercel.app
- GitHub: https://github.com/airtoxin/disthex-web

GitHub経由への公開移行は別作業として準備中です。既存VercelプロジェクトへのGit接続完了までは、公開中の直接アップロード版を維持します。比較実験・限界・再実行手順は [research/README.md](research/README.md) を参照してください。

## ルール

[作者の一次ルール](https://github.com/airtoxin/my-games/blob/master/Disthex/rule.md) に準拠します。Game design: airtoxin, 2017.

- 青は上下、赤は左右の対辺を自分の石でつなげば勝ち。
- 空きマスに交互に1石を置く。ただし、相手の**直前の着手**に隣接する6マスには置けない。古い石に恒久的な禁止はない。
- 初手後の2番手は色交換を選べる。盤上の石・ゴールは動かさず、プレイヤーと色の対応を交換する。赤の着手から続行し、初手の隣接制限を維持する。
- 合法手なしの場合だけパス。作者に確認済み。直前ターンがパスなら隣接禁止はなく、次の置石で新しい禁止領域が生じる。
- 7×7（推奨）、9×9、11×11に対応。

作者の設計意図は、一時的禁止と離れた脅威を巡る大局的な攻防です。通常Hexの橋を接続保証として扱いません。

## 開発と検証

Node.js 22.17.1で検証。依存バージョンはlockfileで固定しています。

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
npm run test:e2e
```

E2Eはインストール済みEdgeをheadlessで使います。PCとiPhone 13相当のviewportを検証します。外部プレビューを検証する場合は `BASE_URL` を指定します。実機スマホ・Safariの検証は含みません。

対局は `localStorage` の `disthex.game.v1` に保存します。現形式version 2は設定と対局を含み、旧version 1の対人戦も読み込めます。フォントはGoogle Fontsと端末フォールバックを使います。

## CPUと履歴

- UIは先手／後手、3段階の思考時間（120 / 450 / 1200ms）を選択可能。
- 強化ブランチは反復深化αβ探索。静かな局面の候補を段階的に広げ、全盤の即勝ち・必須防御・次手の勝ちを迫る手を候補上限外でも残します。
- 禁止を巡る強制応酬では最大4追加手の読みを許し、通常深さの上限は4 / 6 / 8。時間内に完了した反復の結果を採用します。
- 7×7は最短接続距離＋経路幅／ボトルネック、9/11は軽量な距離評価を既定にしています。中央初手へのswap定石は旧AIから維持。
- 選択的な有限探索です。全候補の完全読み、最善手、競技的な強さを保証しません。抵抗近似とMCTSは実験用で、既定CPUには採用していません。
- Module Workerで探索し、設定変更・Undo・確認画面・リセットで停止。request ID、対局の一致、キャンセルフラグで古い応答を破棄します。時間予算+2000msの応答監視と再試行もあります。
- CPU戦は人間・CPUとも合法手なしなら自動パス。Undoは人間の直前の判断まで戻り、Redoは次の判断まで進みます。

## 主なファイル

- `src/game.ts`: 不変のルール、勝利経路、swap/pass、履歴検証。
- `src/ai.ts`, `src/search/`: 強化探索、完全状態キー、評価、探索用状態遷移。
- `src/ai.worker.ts`, `src/useCpuTurn.ts`: Workerとキャンセル制御。
- `src/match.ts`: 対戦設定・保存復元・人間の判断単位の履歴。
- `src/*.test.ts`: 単体・性質・戦術回帰テスト。
- `tests/`: 実Worker対戦と、遅延Workerを使う競合状態のE2E。
- `research/`, `scripts/benchmark-ai.mjs`: 旧AI、比較用MCTS、固定局面、計測記録。

秘密情報、`.env`、`.vercel`、依存ディレクトリ、ブラウザテスト成果物はGitに含めません。
