# AGENT-TASKS.md — Scoped Backlog for Secondary Coding Agents

Tasks sized for a capable coding agent (GPT-5.5 high / Codex / similar) to execute
when the primary agent is unavailable. **Read CLAUDE.md first — its rules override
everything here.** Then read docs/MOCKUPS.md for the visual target.

## Ground rules for any agent working this list

- Run `pnpm test && pnpm lint && pnpm typecheck` before AND after your change.
  All 194+ tests must be green when you finish.
- **Do not touch golden hashes** (`tests/golden/*`) unless your task explicitly
  says so; if a hash moves unexpectedly, your change altered sim behavior — stop
  and reconsider rather than re-pinning.
- Web-only tasks (the default here) must not import from or modify
  `packages/sim-core` — that package is deterministic and golden-pinned.
- Verify visually: `pnpm dev` (port 5199), check both Game and Simulation modes.
- Conventional commits; end commit messages crediting your agent name.
- PowerShell on Windows mangles `$("#...")` and backticks inside double-quoted
  strings — use file-edit tools, not shell string replacement, for TS/HTML.

## W — Web/UI tasks (safe lane: no sim-core)

### W1. Build panel → icon grid (mockup 06) [M]

`panels.ts renderBuildMenu` renders a tall column of repetitive cards. Replace
with a compact grid (3–4 per row): sprite thumbnail (reuse
`assets/gen/buildings/iso/<defId>__base@1x.png` via an `import.meta.glob`, glyph
emoji fallback), name, and compact chips `mass · $ · ±kW`. Category group headers
(Power / Habitat / ISRU / Industry / Logistics — derive from the same predicates
as `classify()` in renderer.ts). Full detail (build cost, prereq lock reason)
appears in a hover tooltip or on selection only. Keep tier tabs + tech-locked
badge + the existing select-to-place flow and `lunaris-*` events.

### W2. Typography hierarchy [S]

index.html uses mono everywhere at ~1 size. Add Inter (system-ui fallback; no
webfont dependency — `font-family: "Inter", "Segoe UI", system-ui`) for labels,
headings, body copy; keep the mono stack strictly for telemetry numbers (chips,
.kv values, charts, clock). Establish three sizes (11/13/15) + the existing
letter-spacing for headers. Touch only CSS.

### W3. Map overlay toggles + legend (mockup 06 toolbar) [M]

Add an overlay chip row floating top-left of the map (under #tutorial):
ILLUMINATION / ICE / NETWORK / RADIUS toggles. Illumination = the class-A gold
and PSR-dark data overlay (already drawn — give it a container/flag so it can
hide); ICE = blue speckle + iceFrac heat tint inside PSRs; NETWORK = the MST
cable layer; RADIUS = comms/shielding circles around buildings with
`commsRelay`/`shieldingAura`. Renderer: expose `overlays: {illum, ice, network,
radius}` booleans read in `draw()`/init layers. Persist choices in module state
only (no storage).

### W4. Numbered building badges + selection ring (mockup 06) [S]

Draw a small numbered chip (build order index, stable by entity id) above each
building sprite and an amber selection ring around the currently inspected
entity. Renderer change only: track `selected: number | null` set from
`main.ts` where `app.hud.select(found)` is called.

### W5. Animated network flow [S]

The MST cable layer is static strokes. Animate 2–3 px dots flowing along each
edge (phase from `performance.now()` — RENDERING ONLY, never sim state; sim-core
determinism rules do not apply to the web package's visuals). Amber at night,
cyan by day. Cap total dots ~200 for perf.

### W6. Exploration screen backdrop + polish (mockup 05) [M]

Set `assets/gen/terrain/explore__shackleton.png` (glob, optional) as a dimmed
backdrop panel behind the fleet list. Add a terrain elevation profile strip for
the selected rover's current traverse: sample `tileAt()` elevations along the
straight line rover→target into a small canvas sparkline. Show traverse risk
chips (distance vs round-trip range %, survey hours, night-ops note).

### W7. Habitat cutaway screen (mockup 01) — art-dependent parts optional [L]

New rail screen HABITAT: if `assets/gen/cutaway/shell.png` exists, render it
with room plates positioned over bays; until then, build the DATA version: a
bay grid (one cell per habitat/medical/exercise/greenhouse building) showing
occupancy (crew chips by location), services provided, condition bar, internal
temp. Clicking a crew chip selects them (reuse `ui.selectedCrew`). Keep it
truthful — crew location comes from `CrewComponent.location`.

### W8. Procedural audio (ART-DIRECTION "Audio (later)") [M]

WebAudio synth module (no asset files): soft UI tick on button press, two-tone
chirp per alert severity, low pad swell at phase transitions, sub-bass rumble
during SPE impact ticks. Master mute button in #controls, DEFAULT MUTED,
preference in module state. Hook via existing alert seq watching in hud.ts (add
a callback), not by polling sim internals.

### W9. 2.5D terrain spike (owner request: "mix between 2D and 3D") [L, spike]

Prototype ONE approach behind a toggle and report findings in the PR
description rather than committing to it everywhere:
(a) parallax elevation: offset each building/site/rover sprite's y by
`-elevationM * k * camera.zoom` and add a subtle per-tile brightness step —
cheap fake depth; or (b) a Pixi mesh/displacement filter over the terrain
plate driven by a heightmap canvas generated from tile elevations. Must keep:
camera math (`tileAtClient`) accurate for clicks, 60 fps at zoom 1 on a 64×64
map, glyph/procedural fallback intact. Do not change sim-core or tile data.

## S — Sim-core tasks (HIGH CARE: goldens will move; only take these if confident)

### S1. Policy AI never builds power storage (balance bug, observed live) [M]

A Phase-3 AI base showed `0/0 kWh stored`. The infrastructure want-table in
`packages/sim-core/src/systems/policy.ts` lacks `battery-bank` /
`regen-fuel-cell`. Add wants scaled to night load (e.g. batteries ≥
`ceil(demandKw * 4h / storageKwh-per-bank)` after fission exists, capped ~8; RFC 1
when unlocked). Then: run `npx tsx tools/check-crew.ts` (3-year soak — crew must
survive, no regression), expect ALL FIVE M6 preset timeline hashes in
`tests/golden/m6-simulation.test.ts` to move, re-pin them, and explain the cause
in the commit message per CLAUDE.md rule 6. M2–M5 scripted goldens must NOT move
(they don't use the policy AI) — if they do, you broke something else.

### S2. Solar-array dust cleaning order (small) [S]

EVENTS.md lists dust accumulation alerts; crew with `dust_mitigation` tech clean
automatically, but the player has no manual action. Add `cmd-clean-dust`
{building} command (game-def): consumes 2 crew-hours abstracted as a small
condition-free dust reset on one building, only when living crew > 0. Unit test
in `packages/sim-core/src/__tests__/`. Goldens unaffected (new command unused in
scenarios) — verify, do not re-pin.

## Priority if you only do a few

W1 (build panel) → W2 (typography) → W3 (overlays) → S1 (storage bug) → W5/W4
(map life) → W6 → W7 → W8 → W9.
