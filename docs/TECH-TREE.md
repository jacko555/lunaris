# TECH-TREE.md — Research Tree Spec

Science points from labs/scientist crew + milestone grants. Nodes carry real Technology Readiness Levels (TRL, NASA 1–9) as of 2026: high-TRL nodes are cheap/fast (engineering), low-TRL expensive/risky. Format: `id · phase · TRL(2026) · cost(sci) · prereqs → unlocks`.

## Branch A — Transportation & Landing

- `precision_landing` · P0 · TRL 8 (SLIM/Blue Ghost) · 20 → +landing success to 0.85
- `night_landing_nav` · P2 · TRL 6 · 40 · prereq nav beacons → removes night-landing penalty
- `heavy_cargo_lander` · P2 · TRL 6 · 60 → 10–15 t class missions
- `orbital_refueling` · P3 · TRL 5 (Starship transfer tests) · 120 → Starship-class 100 t missions, $/kg tier 4
- `reusable_surface_hopper` · P4 · TRL 3 · 150 → intra-lunar transport
- `mass_driver` · P5 · TRL 2 · 400 · prereq MW grid → Mass Driver segments

## Branch B — Power & Thermal

- `surface_power_40kw` · P1 · TRL 6 (FSP program) · 50 → Fission unit
- `regen_fuel_cells` · P2 · TRL 5 · 40 → RFC building
- `fission_cluster` · P3 · TRL 5 · 100 → multi-unit grid, MW scale
- `insitu_solar_cells` · P4 · TRL 3 · 200 · prereq refinery+Si → Solar Farm from local Si
- `beamed_power` · P5 · TRL 3 · 250 → PSR mining without cables

## Branch C — ISRU & Industry

- `ice_prospecting` · P0 · TRL 7 (PRIME-1 heritage) · 20 → prospector payloads
- `ice_mining_pilot` · P2 · TRL 5 · 60 → Ice Harvester, Volatile Oven
- `electrolysis_propellant` · P3 · TRL 6 · 50 → Electrolyzer, Cryo Plant, Depot
- `mre_oxygen` · P3 · TRL 4–5 · 100 → MRE plants
- `ilmenite_reduction` · P3 · TRL 4 · 80 · mare site → Reduction Plant
- `regolith_printing` · P3 · TRL 4 (D-Shape/ICON demos; Chang'e-8 test) · 90 → Printer, pads, berms, printed habs
- `metal_refining` · P3 · TRL 4 · 90 → Refinery, Workshop
- `advanced_manufacturing` · P4 · TRL 3 · 200 → Fab Plant (machine components)
- `volatile_combine` · P5 · TRL 3 (Interlune full-scale excavator demo 2025) · 250 → He-3 chain
- `local_electronics` · P6 · TRL 2 · 500 → removes last import dependency

## Branch D — Life Support & Habitation

- `eclss_baseline` · P2 · TRL 9 (ISS) · free → ECLSS Core
- `water_recovery_98` · P3 · TRL 8 (ISS BPA) · 60 → closure 0.93→0.98
- `sabatier_loop` · P3 · TRL 9 · 40 → Sabatier Unit
- `hydroponics_pilot` · P3 · TRL 6 (Veggie+) · 70 → Greenhouse 50 m²
- `bioregenerative_ls` · P4 · TRL 4 (MELiSSA) · 180 → Agri-Dome, closure ceiling 0.97; unlocks ecology-drift events (Biosphere-2 lesson: higher closure = new instability risks)
- `lava_tube_construction` · P4 · TRL 3 · 200 · prereq printing → Lava Tube Hab
- `surgical_medicine` · P4 · TRL 5 · 120 → Medical Center; removes evac dependence
- `partial_g_countermeasures` · P4 · TRL 3 · 150 → halves health drift; enables safe births (event arc)

## Branch E — Science & Operations

- `space_weather_forecasting` · P2 · TRL 7 · 30 → SPE warning 12→48 ticks
- `dust_mitigation` · P2 · TRL 5 (EDS demos flew on Blue Ghost) · 50 → −50% dust degradation
- `automation_robotics` · P3 · TRL 5 · 100 → unstaffed building floor 0.5→0.8
- `ai_operations` · P4 · TRL 4 · 150 → floor 0.95; policy-AI efficiency in sim mode
- `far_side_observatory` · P3 · TRL 5 (LuSEE-Night) · 80 → science multiplier; prestige

Tree rules: ≤3 prereqs/node; every phase transition requires named techs (PHASES.md); Realistic mode adds ±30% cost noise and rare "research setback" events on TRL ≤3 nodes.
