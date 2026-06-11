# ASSET-PLAN.md — AI-Generated Art Pipeline for the "Mission Ops" Visual Overhaul

Target: the five mockup screens (crew/habitat cutaway, logistics, crisis map, production
chain, exploration map). Every asset below is generated with **gpt-image-2** via the
Codex CLI `$imagegen` skill, named to match `data/base/*.json` ids so the renderer maps
`defId → sprite` with zero lookup tables.

## 0. Ground rules

- **License:** generated images land in `assets/gen/` (separate asset license, per
  CLAUDE.md rule 7). Never in `packages/`.
- **Chroma key, not transparency:** gpt-image-2 does NOT support
  `background=transparent`. Every sprite prompt ends with the chroma block (§3). Post:
  `tools/strip-chroma.mjs` (task T1) removes `#FF00FF` and trims.
- **Determinism of style, not pixels:** generate the **anchor image first** (A-01),
  then pass it as a reference image to every later building/vehicle call ("match the
  rendering style, camera, lighting and scale of the attached reference").
- **One category per session:** style drifts across long sessions; batch ≤10 per call,
  restart per category with the anchor attached.
- Master resolution 1536×1024 or 1024×1024; ship downscaled @1x/@2x (task T2).

## 1. Directory & naming convention

```
assets/gen/
  buildings/iso/<defId>__base.png        # day-lit isometric sprite
  buildings/iso/<defId>__night.png       # emissive-window variant (P2)
  buildings/iso/site__<S|M|L>.png        # generic construction scaffold
  terrain/baseplate__day.png             # 4k iso terrain the base composites onto
  terrain/baseplate__night.png
  terrain/explore__shackleton.png        # orbital DEM-style exploration backdrop
  terrain/keyart__start.png              # start-screen hero
  vehicles/<id>__side.png                # logistics route + detail panels
  vehicles/<id>__iso.png                 # on-map (rovers, landers)
  crew/portrait__<nn>.png                # 16 portraits, neutral background
  cutaway/shell.png                      # habitat cross-section outer hull
  cutaway/room__<module>.png             # interior room plates
  cards/event__<eventId>.png             # event/alert card art 16:9
  cards/phase__<n>.png                   # phase milestone cards
```

Rule: `<defId>` and `<eventId>` are EXACTLY the ids in `data/base/buildings.json` /
`events.json`. A sprite whose name doesn't match a data id is a bug.

## 2. Global style block — prepend to EVERY prompt

> LUNARIS visual style: photorealistic hard-surface render of near-future lunar
> hardware, NASA/ESA engineering aesthetic — white and gold multi-layer insulation,
> brushed aluminum, matte sintered-regolith grey, subtle wear and dust accumulation on
> lower surfaces. Lighting: single hard key light from upper-left, 35° elevation
> (vacuum sunlight, no atmospheric scattering), deep black shadows with faint
> earthshine-blue fill, one crisp contact shadow to the lower-right. Color grade:
> desaturated steel/charcoal with amber and cyan accent lights. No people unless
> specified. No text, no watermarks, no UI elements.

## 3. Chroma block — append to every SPRITE prompt (not backdrops/cards/portraits)

> Render the object centered, fully inside frame with 8% margin, on a SOLID UNIFORM
> #FF00FF magenta background. No floor plane except the object's own cast shadow
> rendered ON the magenta. No gradient, no vignette, no reflections of the background.

## 4. Camera spec for all `iso/` sprites

> True dimetric game projection: camera rotated 45°, elevated 30°, orthographic (no
> perspective convergence), object footprint aligned to a 2:1 diamond grid. Scale
> class S = object fits a 1×1 grid cell, M = 2×1, L = 2×2, XL = 3×3 — match the
> attached reference sprite's pixels-per-cell exactly.

---

## 5. Manifest

### A. Style anchor (generate FIRST, reuse as reference everywhere)

| file                                         | prompt core                                                                                                                                                                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildings/iso/foundation-habitat__base.png` | A-01 anchor. "Cylindrical rigid lunar habitat module on short jack legs, white MLI wrap with gold foil end-caps, small porthole windows glowing warm amber, external cable trays and a ladder, regolith dust staining the lower third. Scale L." + §2 + §4 + §3 |

### B. Isometric building sprites — 38 remaining (`__base`; `__night` variants are P2)

Template: _"{descriptor}. Scale {S/M/L/XL}. Match the attached reference sprite."_ + §2 + §4 + §3

| defId                   | scale | descriptor                                                                                                                                           |
| ----------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| solar-array-10kw        | M     | Deployable ROSA-style roll-out solar wing on a single-axis tracking mast, dark blue photovoltaic blanket with visible cell grid                      |
| battery-bank            | S     | White rack of cylindrical battery modules in an open radiator-finned frame, amber status strip                                                       |
| regen-fuel-cell         | S     | Paired pressure spheres (H₂/O₂) plumbed to a compact fuel-cell skid, frost on one sphere                                                             |
| fission-surface-power   | L     | Kilopower-style fission unit: stubby shielded core half-buried behind a regolith berm, four umbrella radiator panels deployed above, hazard chevrons |
| rtg-keepalive           | S     | Small RTG on a tripod, black cooling fins, faint heat shimmer                                                                                        |
| radiator-wing           | M     | Tall white vertical radiator panel array edge-on to the sun, coolant manifold at the base                                                            |
| storm-shelter           | M     | Low half-buried cylinder under a thick sintered-regolith arch, single heavy airlock door, radiation trefoil placard                                  |
| eclss-core              | S     | Boxy life-support module dense with external plumbing, CO₂ scrubber drums, white/silver, green status lights                                         |
| water-gas-storage       | M     | Tank farm: three horizontal cryo tanks in a frame, frost lines, pressure relief stacks                                                               |
| comms-tower             | S     | Lattice mast with a high-gain dish and two whip antennas, red beacon, guy wires                                                                      |
| exercise-module         | S     | Small inflatable module with a porthole showing a treadmill silhouette                                                                               |
| clinic                  | S     | White module with red cross placard, external medical-gas bottles                                                                                    |
| sabatier-unit           | S     | Compact chemical reactor skid, coiled heat exchanger, CH₄ flare stack (unlit)                                                                        |
| field-lab               | S     | Instrumented science box on legs: mast camera, sample carousel, deployed solar flap                                                                  |
| ice-harvester           | M     | Tracked excavator with a rotating bucket-wheel drum, floodlights on (works in PSR dark), ice glitter in the drum                                     |
| volatile-oven           | M     | Sealed rotary kiln with vapor capture hood and cold-trap coils, faint vapor wisp                                                                     |
| electrolyzer            | S     | Electrolysis stack: plate cell tower between two gas dryers, blue accent lighting                                                                    |
| cryo-plant              | M     | Cryocooler plant: compressor skid, radiator, two small spherical LOX dewars, heavy frost                                                             |
| mre-plant-s             | M     | Molten regolith electrolysis pilot: glowing orange crucible vessel under a fume hood, slag pot beside                                                |
| mre-plant-l             | L     | Industrial MRE line: three crucible vessels, overhead crane gantry, glowing pour in progress                                                         |
| regolith-printer        | M     | Large 3-axis gantry printer extruding a grey sintered wall section, hopper of regolith                                                               |
| regolith-berm           | S     | Plain crescent berm of compacted grey regolith, machine-compacted ridges                                                                             |
| landing-pad             | XL    | Circular sintered-regolith pad with embedded nav lights and a painted ring, scorch marks                                                             |
| propellant-depot-pad    | L     | Landing pad variant with two vertical cryo tanks and a fueling boom arm                                                                              |
| greenhouse-module       | M     | Tunnel greenhouse with magenta-pink LED grow light spilling through translucent panels, leafy racks visible                                          |
| agri-dome               | XL    | Large geodesic agriculture dome, interior magenta-green glow, condensation on panels                                                                 |
| medical-center          | M     | Two-module hospital with red cross, ambulance rover port                                                                                             |
| refinery                | L     | Ore refinery: crusher intake conveyor, cyclone separators, slag heap                                                                                 |
| workshop                | M     | Open-front machine shop module, robotic arm, racked spare parts                                                                                      |
| fab-plant               | L     | Cleanroom fabrication plant, white, few windows, HVAC stacks, loading dock                                                                           |
| water-reclamation-plant | M     | Water plant: settling tanks, UV treatment tubes glowing faint violet, pipe runs                                                                      |
| printed-habitat-block   | L     | 3D-printed habitat: organic layered-regolith vault walls, inset round windows, amber light                                                           |
| mass-driver-segment     | XL    | Electromagnetic mass-driver rail section on pylons, coil rings, payload sled                                                                         |
| volatile-combine        | L     | Mobile regolith combine: wide intake header, internal tumbler, dust plume behind                                                                     |
| solar-farm-field        | XL    | Field of ten thin-film solar rows receding on the diamond grid                                                                                       |
| beamed-power-pilot      | M     | Rectenna array tilted skyward with a microwave feed mast, faint cyan beam hint                                                                       |
| crater-dome-segment     | XL    | Section of a vast transparent crater-spanning dome: triangular glass panels on white trusses meeting a massive anchor footing                        |
| civic-center            | L     | Glassy public atrium module, interior trees visible, warm light, flag plaza                                                                          |

Construction states (3): `site__S/M/L.png` — "Open excavation with survey stakes,
yellow autonomous crane, pallets of components, scaffold matching scale class {X}".

### C. Terrain & key art (no chroma; full-bleed)

| file                              | size      | prompt core                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `terrain/baseplate__day.png`      | 2560×1440 | Orthographic-dimetric aerial of a flat lunar highland shelf beside the rim shadow of Shackleton crater, fine boot-and-track-scuffed regolith, scattered small craters and boulders, graded road grid in a 2:1 diamond pattern (empty — no buildings), harsh sun upper-left, PSR inky-black lower-right. §2, no chroma |
| `terrain/baseplate__night.png`    | 2560×1440 | Same composition at lunar night: earthshine blue-grey, road edge lights amber                                                                                                                                                                                                                                         |
| `terrain/explore__shackleton.png` | 2560×1440 | Top-down orbital reconnaissance mosaic of the Shackleton crater region, LRO-style: sharp crater rim catching sunlight, permanently shadowed interior, ridge route to de Gerlache, subtle elevation hillshading, photographic grain                                                                                    |
| `terrain/keyart__start.png`       | 2560×1440 | Cinematic wide shot: small early lunar outpost at dusk on the crater rim — habitat, two solar wings, a lander on a pad — long shadows, Earth low on the horizon, a single astronaut walking a supply route                                                                                                            |

### D. Vehicles

`__side` = side elevation for panels (chroma); `__iso` = on-map sprite (chroma + §4).

| id               | views     | descriptor                                                                       |
| ---------------- | --------- | -------------------------------------------------------------------------------- |
| lander-clps      | side, iso | Small CLPS robotic lander, hexagonal bus on four legs, gold foil, single engine  |
| lander-mid       | side, iso | Mid-class crew/cargo lander, two-stage, ladder and airlock                       |
| lander-heavy     | side, iso | Heavy cargo lander, wide squat tank cluster, four engines, cargo crane arm       |
| starship-hls     | side, iso | Tall stainless-steel HLS-style lunar ship, black thermal sections, elevator rail |
| transit-stage    | side      | Cislunar transit tug: drop tanks, solar wings, docking ring                      |
| leo-station      | side      | Small LEO depot station: two modules, truss, fuel drum                           |
| rover-scout      | side, iso | Two-seat unpressurized fast rover, wire wheels, camera mast                      |
| rover-prospector | side, iso | Six-wheel autonomous prospecting rover, ground-penetrating radar boom, drill     |
| rover-sampler    | side, iso | Pressurized lab rover, sample airlock, robotic arm                               |

### E. Crew portraits — `crew/portrait__01..16.png`, 1024×1024

Template: _"Head-and-shoulders portrait of {person}, wearing a slate-grey LUNARIS
flight suit with mission patches, inside a softly lit habitat corridor, shallow depth
of field, photorealistic, neutral confident expression."_ + §2 grade. Cast for
variety: 8 women / 8 men; mix of East Asian, South Asian, Black, Latino, Middle
Eastern, White; ages 28–58; roles to suggest via details (commander's silver hair,
geologist's sample tablet, medic's stethoscope collar, engineer's smudged cheek...).
Name files in order; `data` maps names→portraits at runtime by index hash.

### F. Habitat cutaway — `cutaway/`

| file                      | prompt core                                                                                                                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell.png`               | Side cross-section "ant farm" cutaway of a buried two-deck lunar habitat: regolith overburden above, structural ribs, EMPTY room bays with consistent 16:9 bay proportions, connecting ladders and corridors, engineering linework edges. 2560×1440       |
| `room__quarters.png` etc. | Interior elevation of one habitat bay, strict head-on side view, warm practical lighting: {variant}. One per: quarters, galley, clinic, lab, comms, greenhouse, gym, workshop, life-support, observatory. 1024×576 each, designed to slot into shell bays |

### G. Event & phase cards — `cards/`, 1536×640 (cinematic strip)

One per event id: spe-minor, spe-major (sun erupting over limb), micrometeorite
(streak + dust burst), moonquake (cracked berm), fission-scram (control room red
light), eclss-component-failure (technician at open panel), budget-cut (empty mission
control desk), budget-boost (launch crowd), resupply-slip (fogged launchpad),
accords-safety-zone (two flags on a ridge), autonomy-referendum (settlers assembled in
the civic atrium). Plus `phase__0..6`: robotic lander → first bootprints → outpost at
dusk → ice mine floodlights → greenhouse interior → mass driver firing → domed crater
city.

### H. UI icons — DO NOT generate raster icons

Resource/nav/alert icons must stay crisp at 14–20 px: hand-author as SVG (or use
Lucide/Phosphor, MIT). gpt-image-2 raster icons at that size read as mud. (P2 task.)

---

## 6. Codex CLI run book

1. `codex` in repo root (needs `$imagegen` skill, signed in; gpt-image-2 is the
   default image model since 2026-04).
2. Anchor: _"$imagegen Generate exactly this: {A-01 full prompt}. Save to
   assets/gen/buildings/iso/foundation-habitat\_\_base.png"_.
3. Per category, batched ≤10: _"$imagegen Using the attached
   assets/gen/buildings/iso/foundation-habitat**base.png as the style/camera/scale
   reference, generate these 10 sprites: {rows}. Save each as
   assets/gen/buildings/iso/<defId>**base.png"_.
4. After each batch: `node tools/strip-chroma.mjs assets/gen/buildings/iso` then eyeball
   a contact sheet; regenerate misses individually with "keep everything, change only…"
   edits (gpt-image-2 mask editing).
5. Codex default save path is `~/.codex/generated_images/` — always specify the
   target path in the prompt, or move after.

## 7. Task list

- [ ] T1 `tools/strip-chroma.mjs` — flood-key #FF00FF→alpha (tolerance ~12%), despill
      magenta fringe, trim, emit @1x/@2x. (sharp, devDependency)
- [ ] T2 `tools/contact-sheet.mjs` — tile a category into one PNG for review
- [ ] T3 Generate A (anchor) → B (buildings) → D (vehicles) → C (terrain) — the
      minimum set for the new map renderer (~55 images)
- [ ] T4 Renderer v2: composite `baseplate__day` + iso sprites at diamond-grid
      positions, zoom/pan camera, day/night crossfade, SPE vignette kept
- [ ] T5 Generate E (portraits) + wire into roster/inspector
- [ ] T6 Generate G (cards) + event-feed "chronicle" UI in observer mode
- [ ] T7 Generate F (cutaway) + habitat interior screen
- [ ] T8 `__night` building variants + emissive pass
- [ ] T9 SVG icon set (H)
- [ ] T10 Asset license note in assets/gen/README (AI-generated, gpt-image-2, date,
      not under the code MIT license)

P1 = T1–T4 (the map stops being rectangles). P2 = T5–T7 (the mockup screens). P3 = T8–T10.

## Status (2026-06-11)

**P1 COMPLETE and integrated**: all 39 building sprites, 3 construction
sites, 4 terrain plates (day + night + explore + key art), 9 vehicles ×2
views — generated, chroma-stripped, rendering in-game. Terrain plates are
composited UNDER a data-truth overlay (real PSR/ridge/slope tiles tinted
on top) and apply to shackleton_rim only; de_gerlache keeps procedural
hillshade until a per-map plate exists (name it
`baseplate__<mapId>__day.png` when generating).

**Remaining queue for Codex, in value order:**

1. P2 portraits (16) — the crew detail panel has portrait slots live
2. P2 event cards (11) + phase cards (7) — chronicle/banner art slots
3. tech cards (34) — research detail panel
4. `__night` building variants (39) — the night plate is in; emissive
   windows are the missing half
5. cutaway shell + 10 rooms — needs its screen built first
6. `baseplate__de_gerlache_rim__day/night` — second-site plates
7. moon-disc + SVG icon pass (P3)

---

## 8. Addendum — mockup set v2 (build day/night, research tree, observer dashboard)

### New assets

| file                       | count | prompt core                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cards/tech__<techId>.png` | 34    | One per id in `data/base/tech.json`. Template: "Documentary photograph illustrating {tech name} on the lunar surface or inside a habitat lab: {one-line scene — e.g. automation_robotics: an autonomous robotic arm assembling a truss while an engineer supervises on a tablet}. 1536x1024." + §2 (no chroma) |
| `ui/moon-disc.png`         | 1     | Full-disc Moon photograph, straight-on, black background, for the lunar-cycle clock dial (masked/rotated in CSS)                                                                                                                                                                                               |

Scene one-liners for the 34 tech cards live next to each node's `description` in
`data/base/tech.json` — derive, don't invent new lore.

### Priority changes

- `buildings/iso/<defId>__night.png` (39) and `terrain/baseplate__night.png`: **promoted P3 → P1.5**. The night view carries the game's central tension; day-only would read as half-finished against these mockups.
- Night UI theme already exists in the web client (warm-red accents after sunset) — keep, retune to the mockup's red-on-black.

### Explicitly NOT assets (procedural, zero generation)

- Building connection network (roads/cable trays with glow): PixiJS polylines + bloom-ish layered strokes; sprites can't follow arbitrary layouts.
- Numbered node badges (01..NN), selection ring, "show radius" circles: vector.
- Lunar-cycle clock dial: canvas arc + `ui/moon-disc.png` rotated.
- All charts (ideal-vs-realistic overlays, radiation forecast histogram): existing canvas sparkline layer, extended.

### Feature notes harvested from the mockups (renderer/UI backlog, not assets)

- **Dual-run comparison (observer):** run a shadow world — same seed, other failure
  table — and overlay both series on every chart. Deterministic core makes this ~free;
  it is the single most differentiating feature on these screens. (T11)
- Event log entries carry cause → effect chains (alert codes already exist; needs a
  parent-alert reference in AlertsComponent). (T12)
- Live map thumbnail in the observer view = the Pixi canvas rendered small. (T4)
- Research screen layout = branches A–E as columns, unlock-phase as rows; TRL chip can
  map from each node's `phase` field. Pure UI re-skin of existing tech data. (T13)

### Task list additions

- [ ] T11 Shadow-world dual-run compare mode in observer (same seed, ideal vs realistic)
- [ ] T12 AlertsComponent: optional `causedBy` seq reference + UI chain rendering
- [ ] T13 Research screen v2 (branch-column grid + tech cards) once `cards/tech__*` exist
- [ ] T14 Generate `__night` set + baseplate\_\_night (P1.5, after T4 proves the day pipeline)
