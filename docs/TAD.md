# TAD.md — Technical Architecture Document

## 1. Stack decision

- **Now:** TypeScript monorepo (pnpm). `sim-core` = pure deterministic ESM library. `web-client` = Vite + PixiJS (2D) + a thin React (or vanilla) UI layer for panels. Charts: uPlot (tiny).
- **Later (Stage 4):** Godot 4 port. Decision rationale: MIT license, exports to web AND desktop/Steam, GodotSteam for Steamworks. Note Godot 4 web export = Compatibility renderer, no C# on web ⇒ port sim logic to GDScript or embed compiled core via WASM (spike before committing).
- Rejected: Unity (WebGL weight + licensing trust), Unreal (no real web path, heavy), custom engine (cost).

## 2. Architecture overview

```
┌────────────── web-client (render thread) ──────────────┐
│ PixiJS map renderer │ UI panels │ charts │ input → Cmds │
└───────────────▲────────────────────────────┬───────────┘
        snapshots/events                 commands
┌───────────────┴────────────────────────────▼───────────┐
│            Web Worker: sim-core runtime                │
│  World(ECS) · RNG(seed) · Systems registry · Scheduler │
│  CommandQueue · EventLog · Snapshotter · Hasher        │
└───────────────▲────────────────────────────────────────┘
            data packs (JSON, zod-validated)
```

- Worker messages: `{type:'cmds'|'speed'|'save'|'load'}` in; `{type:'snapshot'|'events'|'alert'}` out. Snapshot = diffed component arrays (structured clone), 10 Hz max to renderer; renderer interpolates.

## 3. ECS

- Components are plain data (no methods), stored in typed Maps keyed by entity id (number). v1 simplicity over archetype perf; revisit if profiling demands.
- Systems run in a fixed registry order each tick: Environment → Power → Thermal → ISRU/Reactions → Construction → ECLSS → Crew → Logistics → Research → Events → Phase → Economy → Cleanup.
- Commands (player/AI) apply at tick start; everything serializable.

## 4. Determinism contract

Seeded mulberry32; single draw order; no wall-clock; quantize floats at tick end; stable sorts only; world hash (FNV-1a over canonical JSON) checked in golden tests. The Policy AI (simulation mode) lives inside sim-core and draws from the same RNG ⇒ scenario runs are reproducible.

## 5. Data-driven content

`data/base/` pack: constants.json, resources.json, reactions.json, buildings.json, tech.json, events.json, scenarios/, maps/, encyclopedia.json. Zod schemas in `sim-core/src/schema/` mirror docs/DATA-SCHEMA.md. Mods = additional packs merged by id with `extends`/`override` semantics.

## 6. Saves

`{version, seed, tick, config, world: components, commandLog?: optional}` → JSON (gzip via CompressionStream). Migrations: pure functions vN→vN+1 chained. Export/import as file; deployed site may also use a storage adapter (localStorage) — adapter interface keeps the in-chat/preview build in-memory.

## 7. Testing

- Unit: each system in isolation with builder fixtures.
- Invariants: property tests — mass conservation, energy ledger, dose monotonicity.
- Golden: scenario scripts → expected hash @N ticks (CI matrix Node 20/22).
- Balance harness: `tools/balance.ts` runs headless scenarios and prints KPI tables (time-to-Phase-3, deaths, closure %) for design review.

## 8. Performance budget

Tick ≤8 ms @500 entities (worker); snapshot diff ≤2 ms; renderer 60 fps with ≤2k sprites. Optimization ladder if exceeded: dirty-flag systems → typed arrays for hot components → WASM core.

## 9. Repo layout

As in CLAUDE.md file map. CI: lint, typecheck, test, schema-validate data, build, deploy on tag.

## 10. Port plan (Stage 4)

1. Freeze sim-core API; document message protocol.
2. Spike: Godot 4 + WASM-embedded TS core vs GDScript rewrite (prefer WASM embed if web+desktop parity holds).
3. Rebuild renderer/UI in Godot scenes; reuse JSON data packs verbatim.
4. GodotSteam: achievements, cloud saves, Workshop mod distribution. Web build remains free and current.
