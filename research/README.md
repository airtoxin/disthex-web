# Disthex AI: local comparison record

Status: experimental implementation, not deployed. Git baseline: `baseline/cpu-v1` at `363d2eaa11b933b5617507818d074a41fb37d3ae`. The published application remains on that baseline.

## Design intent and implementation

Disthex's immediate-neighbor ban changes after each turn. A distant move can release a previously forbidden winning point. Ordinary Hex bridges, virtual connections, H-search and dead-cell pruning are **not** used as proven connections or safe pruning rules.

The new alpha-beta policy:

1. Finds physically connected components and all empty points that would immediately connect either color. These scans cover the whole board.
2. Takes an immediate legal win. When the opponent has next-turn winning points, retains every legal move that denies all of them by occupancy or the next-turn neighbor ban. It detects an immediate forced loss only if there is no own legal win and no such defense.
3. Marks placements that create a future winning point as forcing candidates. These are retained outside the quiet-move limit; their threat is not treated as automatically won. The opponent's actual legal replies still get searched.
4. Quiet candidates start from 7/10/14 and grow by 4 per completed iterative depth. The best candidate in each of nine geometric regions is also retained. These regions are only a coverage heuristic, not independent subgames. The shallow iteration evaluates all actions.
5. Extends a horizon with mandatory defensive replies by up to four extra plies. This reads temporary blocks and counterplay without assuming that a restriction persists.
6. Uses immutable search transitions, checked against the authoritative rules engine. Cache keys include size, full board, turn, last move, player/color ownership, swap state, placement count and winner. Evaluation/fact maps live for one request; the transposition-bound table is reset each iteration.
7. Keeps the original center-opening swap heuristic for an isolated comparison. Other swaps are searched with fixed player identity and changing color ownership.

Time limits remain 120/450/1200ms. Normal depth caps are 4/6/8 plus bounded tactical extensions. A deadline returns the last completed iteration, or a legal fallback. Deadlines are checked between bounded synchronous computations, not hard real-time guarantees.

### Evaluation

The common score is `100 * (opponent distance - own distance) + 2 * centrality difference`. Empty cells cost 1, own stones 0, opponent stones are impassable. A currently forbidden empty cell for the side to move adds 0.35, not a permanent wall.

The routes variant additionally measures alternative empty cells along equally short actual routes, grouped by distance from one goal. It adds 18 times the log-width difference and subtracts 12 times the proportion-of-single-choice-layer difference. These are heuristics, not disjoint-path or connectivity guarantees.

Heap-based Dijkstra computes the same distances as the initial linear-scan implementation; sampled 7/9/11 states are checked against v1 distances. The final default uses routes on 7×7 and the lighter distance score on 9/11.

The resistance experiment uses a 24-sweep approximate resistor network: own stones resistance 0.08, empty 1 (+0.35 for current bans), opponent stones excluded. A log-conductance difference is added to the common score. Finite-sweep estimates are not converged effective resistance. Poor results below reject this particular short-budget implementation, not the author's broader hypothesis.

### Author's future direction

The author suggests a division between local Nim-like tempo/threat exchanges and a global resistance-style multi-route score. This is a research hypothesis. No Nim-sum or local-independence assumption was added: playing elsewhere relocates the ban, so regions may be coupled.

A possible next experiment is to measure local reply obligations, ability to play elsewhere, and first-move advantage, then combine those features with a better calibrated global network score and actual search. It needs its own ablation and unseen-position validation.

## Experimental method

- One machine, sequential searches: Intel Core i7-14700F, Windows, Node 22.17.1.
- Every head-to-head move is allotted the same **120ms wall-clock cap**, including all analysis by that policy. No concurrent benchmark jobs.
- Identical legal starting histories and both player assignments for each pair. Ownership follows swap correctly.
- `fixtures.ts` separates 4 tuning starts, 8 initial confirmation starts and a fresh final set. The final set was generated after selecting the algorithm and board-size policy, without using its outcomes to change them.
- Openings include center, corner, off-center and swap opportunities; generated early/middle/late positions are seeded and replayed through the real rules.
- This is a small, artificial corpus. Some late positions are already effectively decided. Paired games are correlated and are not 16 independent samples. No Elo or statistical strength claim is made.
- All 152 games across the bounded phases completed, with no illegal moves. Total measured benchmark time was about 166 seconds, plus separate timing probes. No unlimited runs.
- The original v1 easy depth cap of 2 leaves much of its 120ms budget unused. A second v1 control raises its depth cap to 6 with the same beam and 120ms cap. This distinguishes the time-utilization effect from other changes.
- v1 source is preserved in `ai-v1.ts`; the runner checks it against Git, allowing only the relative import-path change. Initial records had corrupted Japanese level labels only; numeric settings and search code were identical. Labels were corrected before final confirmation.
- JSON files include complete starting histories, every action, measured time, depth, nodes, deadline flags, and source hashes. The recorded commit for early runs is the baseline ancestor because changes were still uncommitted; source hashes identify the candidate files.

## Results

### Selection experiments (tuning set, not confirmation)

| Variant versus published v1 | Wins–losses | Games |
|---|---:|---:|
| Enhanced search, distance | 5–3 | 8 |
| Enhanced search, routes | 6–2 | 8 |
| Enhanced search, resistance proxy | 3–5 | 8 |

Ablation results against the full routes policy, on three tuning starts:

| Removed/replaced component | Variant wins–losses | Games |
|---|---:|---:|
| Tactical retention/filtering and extensions | 2–4 | 6 |
| Extensions only | 3–3 | 6 |
| Regional coverage and progressive widening | 3–3 | 6 |
| Learning-free MCTS | 2–4 | 6 |

Six games cannot establish the contribution of each component. Extensions and coverage are retained for their tested rule-specific behavior, with their strength contribution still unproven.

Initial unseen 7×7 confirmation: routes beat published v1 12–4 and deeper v1 10–6. Large-board routes then scored only 2–6 across 9/11. Heap optimization increased searched nodes but did not change that result. Switching large boards to distance scored 6–2 on those same starts; that was selection data and was not presented as final confirmation.

### Final fresh confirmation (final default policy)

| Board / opponent | Wins–losses | Games / pairs | Mean move ms | P95 ms | Search nodes | Deadlines / moves |
|---|---:|---:|---:|---:|---:|---:|
| 7×7 / published v1 | 12–4 | 16 / 8 | 69.64 | 120.05 | 87,136 | 53 / 102 |
| 7×7 / deeper v1 | 9–7 | 16 / 8 | 74.12 | 120.05 | 96,559 | 54 / 106 |
| 9×9 / published v1 | 3–1 | 4 / 2 | 100.19 | 120.06 | 78,199 | 51 / 64 |
| 11×11 / published v1 | 3–1 | 4 / 2 | 102.83 | 120.16 | 27,376 | 40 / 47 |

Final candidate maximum measured move time was 120.37ms. Deadline flags mean normal bounded-search completion with a legal fallback, not UI failures. All games finished; illegal moves: 0.

The final 7×7 result versus a deeper v1 control is **9–7**, so the search-method advantage is not established. The evidence is stronger for improvement over the published easy configuration than for superiority at equal utilized computation. Large-board samples are especially small and deeper-v1 large-board comparisons remain untested.

### MCTS and timing probes

The comparison MCTS is learning-free UCT with seeded random expansion, tactical win/defense rollout policy, and at most 14 rollout plies. Nonterminal cutoffs use a distance-based value estimate. It is not pure terminal-only Monte Carlo. On four initial unseen 7×7 starts against routes it scored **0–8**. This rejects adoption of this implementation at 120ms, not MCTS in general.

Search node counters differ: alpha-beta counts recursive states while v1 also counts scored children; MCTS counts expanded and simulated plies. Raw counts must not be treated as equivalent work.

Separate 7/9/11 probes at 120/450/1200ms returned legal actions in all 9 cases. Maximum measured walls were about 120.42 / 450.09 / 1200.51ms. Achieved depths were 2–3 on these opening positions, demonstrating why configured maxima are not promised reading depths.

## Reproduce

```sh
npm ci
node scripts/benchmark-ai.mjs tune routes tune-recheck
node scripts/benchmark-ai.mjs ablate routes ablate-recheck
node scripts/benchmark-ai.mjs confirm routes confirm-recheck
node scripts/benchmark-ai.mjs scale distance scale-recheck
node scripts/benchmark-ai.mjs mcts routes mcts-recheck
node scripts/benchmark-ai.mjs fresh adaptive fresh-recheck
node scripts/verify-search.mjs
```

Each run has a 180-second overall cap (tuning: 240 seconds), 120ms per action and a finite game-action bound. Do not run suites concurrently. Different timing/JIT behavior may change moves; seeded fixtures and MCTS randomness alone do not make time-limited results identical. Current commands use the final heap implementation; earlier pre-heap files are historical measurements.

Recorded data: `results/tune.json`, `ablate.json`, `confirm.json`, `scale.json`, `scale-heap.json`, `scale-distance.json`, `mcts-confirm.json`, `fresh-final.json`, `timings.json`.

## Verification and next decision

Final validation: **49 unit/property tests passed; 46 E2E tests passed (23 desktop + 23 mobile viewport) on the local production build**, with no browser console/page errors. Lint, TypeScript and build passed. Physical phones and Safari remain untested.

Unit/property tests cover legality, immutability, terminal handling, swap/pass, complete-state keys, search/rules parity, heap/old distances, multiple-threat defense, expired bans after distant moves, candidate coverage and tactical extension. UI regression uses the actual Worker as well as controlled delayed Workers for cancellation races.

Before asserting strength or publishing a replacement, use at least 30–50 new paired 7×7 starts and more 9/11 pairs, include 450/1200ms budgets, compare against deeper v1, and add expert-authored distant-threat exchanges. Improving the cost/accuracy of global resistance and validating local tempo features is a better next step than adding unvalidated Nim arithmetic.
