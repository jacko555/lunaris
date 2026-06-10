# CLAUDE.md — Rules for Claude Code in this Repository

This file governs how Claude Code works in the LUNARIS repo. Read it before every task.

## Project summary

Hard-realism lunar colonization sim/game. TypeScript monorepo. Deterministic ECS simulation core (`packages/sim-core`) + PixiJS web client (`packages/web-client`). All game content is data-driven JSON in `data/`. Two modes (observer simulation + manual game) share the same core. See PRD.md and TASKS.md for what to build; docs/ for how systems work.

## Hard rules (never violate)

1. **sim-core purity:** `packages/sim-core` must never import DOM, PixiJS, Node-only APIs, or anything non-deterministic. It is a pure ESM library. CI lints this.
2. **Determinism:** No `Math.random()`, `Date.now()`, `performance.now()`, or iteration over non-ordered structures affecting state, anywhere in sim-core. All randomness flows from the world's seeded RNG. All external input enters via the serializable command queue.
3. **Conservation invariants:** No system may create or destroy resource mass or energy without a declared source/sink. The property tests in `tests/invariants` must always pass. If a feature needs an exception, stop and ask.
4. **Data-driven content:** Buildings, resources, reactions, tech, events, scenarios are defined ONLY in `data/*.json` validated against docs/DATA-SCHEMA.md schemas (zod). Never hardcode content values in TypeScript.
5. **Sourced constants:** Every physical constant or real-world figure lives in `data/base/constants.json` with `value`, `unit`, `source`, `as_of`, and (if applicable) `range`. Defaults come from docs/SDD.md. Do not invent numbers; if a number is missing, flag it as `"status": "needs_source"` and use the SDD range midpoint.
6. **Golden tests:** Never change a golden determinism hash without explaining the cause in the PR/commit message.
7. **License hygiene:** Code contributions are MIT. Do not vendor GPL code into sim-core or web-client. Assets go in `assets/` under the separate asset license.

## Conventions

- TypeScript strict; no `any` (use `unknown` + narrowing).
- Naming: systems `XxxSystem`, components `XxxComponent` (data only, no methods), commands `CmdXxx`.
- One system per file in `sim-core/src/systems/`. Systems are pure: `(world, dt) => void` mutating only via component stores.
- Units in code: SI internally (kg, J, W, K, s, mSv). Ticks are 1 game-hour; convert at boundaries. Suffix variables with units when ambiguous (`massKg`, `powerW`, `doseMSv`).
- Tests colocated in `__tests__/`; every system gets unit tests; every milestone gets a scenario golden test.
- Commits: conventional commits (`feat(core): ...`, `fix(web): ...`, `data: ...`).

## Workflow

1. Find the current milestone in TASKS.md; do tasks in order; tick checkboxes in the same PR.
2. Before coding a system, re-read its section in docs/SDD.md (formulas) and docs/DATA-SCHEMA.md (shapes).
3. Run `pnpm test` and `pnpm lint` before declaring done.
4. Update docs when behavior diverges from spec — spec and code must not drift silently.

## File map

```
PRD.md                 product requirements
TASKS.md               milestone task list (source of truth for work)
CLAUDE.md              this file
docs/                  design specs (GDD, SDD, TAD, PHASES, ECONOMY, BUILDINGS,
                       TECH-TREE, EVENTS, MODES, UI-UX, ART-DIRECTION, ROADMAP, DATA-SCHEMA)
packages/sim-core/     deterministic ECS simulation (pure TS)
packages/web-client/   PixiJS + UI (Vite app)
data/base/             base content pack (JSON, schema-validated)
data/scenarios/        scenario presets
assets/                art/audio (separate license)
tests/                 golden + invariant tests
tools/                 scripts (hashing, schema check, balance reports)
```

## Things Claude Code should proactively do

- Add a constants entry + SDD note whenever a new physical value appears.
- Suggest a balance report (`tools/balance.ts` output) when changing reaction rates.
- Keep the in-game encyclopedia entries (`data/base/encyclopedia.json`) in sync with new content.

## Things Claude Code must NOT do

- Add networking, accounts, analytics, or any server dependency.
- Add browser storage to the artifact/preview build (in-memory only there); localStorage is allowed only in the deployed site build behind the storage adapter.
- Introduce non-deterministic floating-point hazards (e.g., `Array.prototype.sort` without stable comparator on state-affecting data).
