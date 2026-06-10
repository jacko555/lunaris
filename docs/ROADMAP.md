# ROADMAP.md — Milestones & Thresholds

## Stage 1 — Foundations & MVP (v0.1)

TASKS.md M0–M4. Phase-2 outpost playable on web. **Exit:** determinism CI green, first-night-tutorial completion ≥60% of testers, public deploy.

## Stage 2 — Vertical Slice (v0.5)

M5–M6. Phases 0–3, tech tree, economy, both modes, preset scenarios. **Exit:** full P0→P3 playthrough; sim-mode Ideal-vs-Realistic comparison demo; 10 external playtests logged.

## Stage 3 — Full Game (v1.0)

M7. Phases 4–6, food/demographics/exports, encyclopedia, mods, polish. **Exit:** complete arc; mod demo pack; accessibility checklist; itch.io + GH Pages release w/ announcement.

## Stage 4 — Steam Port (v2.0) — threshold-gated

Trigger: (≥500 stars OR ≥5 sustained contributors OR ≥10k web players) AND sim-core API frozen 60 days. M8: Godot 4 port, GodotSteam, paid Steam build (CDDA convenience model), web stays free.

## Decision triggers

- Web perf misses budget → WASM core or accelerate Stage 4.
- Low traction at Stage 3 → stay web-only; Steam optional.
- Contributor surge → invest in DATA-SCHEMA tooling + mod docs first.

## Cadence

Weekly dev builds on `main` auto-deploy to a /next channel; tagged releases monthly during Stages 1–2.
