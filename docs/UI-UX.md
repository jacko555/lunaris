# UI-UX.md — Wireframe Descriptions

## Layout (game mode, desktop web)

```
┌──────────────────────────────────────────────────────────────┐
│ TOP BAR: budget | population | phase badge | LUNAR CLOCK ◐   │
│          (clock = ring showing day/night fraction + ETA)     │
├───────────────┬──────────────────────────────┬───────────────┤
│ LEFT RAIL     │        MAP VIEWPORT          │ RIGHT PANEL   │
│ build menu    │  Pixi tile map, pan/zoom     │ context:      │
│ (tiered tabs) │  overlays: power/ice/rad/    │ inspector /   │
│               │  illumination/dust           │ crew / tech / │
│               │                              │ logistics     │
├───────────────┴──────────────────────────────┴───────────────┤
│ BOTTOM: resource bar (O₂ HₐO food pwr parts $) | alerts | ⏯ │
└──────────────────────────────────────────────────────────────┘
```

## Key components

- **Resource bar:** each resource = icon + stored + net/day arrow + runway ("O₂: 412 kg ▲ +2.1/d · 38d"). Click → flow inspector (Sankey-lite list of producers/consumers).
- **Lunar clock:** the signature widget. Ring = 29.5-day cycle; needle = now; shaded arc = night; markers = scheduled arrivals/SPE warning windows. Hover = "Night begins in 3d 14h".
- **Alert queue:** stacked cards, severity color, each with cause-chain line + buttons (Go to · Fix suggestions · Snooze). Critical alerts auto-pause (configurable).
- **Build menu:** tabs by tier; cards show mass(import cost), power, crew, prereqs; invalid placement explains why (power radius, slope, PSR-only, keep-out).
- **Inspector:** building state machine (NOMINAL/OVERHEAT/…), I/O live rates vs rated, wear bar, priority tier dropdown, encyclopedia link.
- **Crew roster:** list with health/morale/dose-30d bars; career dose; assignment dropdown; shelter status during SPE.
- **Resupply planner:** calendar of windows, vehicle class picker, manifest builder w/ kg + $ totals, risk %, transit ETA mapped onto lunar clock.
- **Tech tree:** branch columns A–E, TRL chip on each node, phase gates drawn as vertical milestones.
- **Phase screen:** current phase criteria checklist with live values ("Closure 41%/50%").
- **Encyclopedia:** searchable; entries auto-generated from data + `source`.

## Simulation mode shell

Config form (scenario JSON knobs) → run view: timeline ribbon (top), charts grid (center), event log (right), speed slider to 1 lunar-day/min, `Take Command` button. Results screen: milestone table + export run JSON + "compare" picker.

## Mobile/responsive

Single-column: map full-bleed, panels as bottom sheets; sim mode works fully (it's the showcase on mobile); game mode best-effort.

## Accessibility

All colors paired with icons/shapes; keyboard map (B build, T tech, space pause, 1-4 speeds); font scale setting; reduced-motion option.
