# SDD.md — Simulation Design Document

The physics/chemistry contract for sim-core. Every formula and constant the simulation uses, with sources. All values are defaults in `data/base/constants.json`; ranges are tunable per difficulty/mode.

Time base: **1 tick = 1 game-hour.** Internally SI units.

---

## 1. Master Constants Table

| ID                      | Value (default)                                       | Range                    | Unit              | Notes / Source                                              |
| ----------------------- | ----------------------------------------------------- | ------------------------ | ----------------- | ----------------------------------------------------------- |
| gravity_lunar           | 1.62                                                  | —                        | m/s²              | ≈ g/6                                                       |
| day_synodic             | 29.53                                                 | —                        | Earth days        | 708.7 ticks per lunar day                                   |
| temp_day_max            | 400                                                   | 380–400                  | K                 | +127 °C equatorial day                                      |
| temp_night_min          | 100                                                   | 95–110                   | K                 | −173 °C night                                               |
| temp_psr                | 40                                                    | 25–40                    | K                 | permanently shadowed regions                                |
| temp_lavatube           | 253                                                   | —                        | K                 | ~−20 °C stable                                              |
| illumination_peak_ridge | 0.90                                                  | 0.85–0.94                | fraction          | south-pole "near-eternal light" sites                       |
| dose_surface_chronic    | 0.5                                                   | 0.4–0.6                  | mSv/day           | GCR-dominated, unshielded                                   |
| dose_limit_30day        | 250                                                   | —                        | mSv               | NASA short-term limit                                       |
| dose_goal_6month        | 150                                                   | —                        | mSv               | mission goal                                                |
| spe_shelter_min         | 4                                                     | —                        | g/cm²             | drops major SPE under 30-day limit                          |
| spe_shelter_safe        | 10                                                    | —                        | g/cm²             | factor-2 margin (~3.3 cm regolith ≈ wrong; see §4)          |
| regolith_density_loose  | 1500                                                  | 1400–1600                | kg/m³             | bulk                                                        |
| regolith_O2_massfrac    | 0.45                                                  | 0.40–0.45                | —                 | oxygen bound in oxides                                      |
| ice_concentration_psr   | 0.056                                                 | 0.027–0.085              | mass frac         | LCROSS Cabeus 5.6 ± 2.9 wt%                                 |
| crew_O2_day             | 0.84                                                  | —                        | kg/p/day          | NASA ALS                                                    |
| crew_CO2_day            | 1.00                                                  | —                        | kg/p/day          | output                                                      |
| crew_water_potable_day  | 3.54                                                  | —                        | kg/p/day          | drink+food prep; hygiene adds ~roughly same again           |
| crew_food_dry_day       | 0.62                                                  | —                        | kg/p/day          | ~2,500–2,700 kcal                                           |
| crew_metabolic_heat     | 137                                                   | 100–170                  | W/person          | waste heat into hab                                         |
| eclss_water_recovery    | 0.93                                                  | 0.90–0.98                | fraction          | ISS 90→98% (BPA upgrade = tech)                             |
| mre_o2_yield            | 0.28                                                  | 0.25–0.30                | kg O₂/kg regolith | recoverable fraction                                        |
| mre_energy_per_kgO2     | 33                                                    | 26–420                   | kWh/kg            | huge literature range; default mid-low                      |
| mre_plant_small         | {mass: 400 kg, power: 14 kW, rate: 1000 kg O₂/yr}     | —                        | —                 | MIT/Schreiner sizing                                        |
| mre_plant_large         | {mass: 1593 kg, power: 56.5 kW, rate: 10000 kg O₂/yr} | —                        | —                 | same                                                        |
| ilmenite_threshold      | 0.075                                                 | —                        | mass frac         | H₂-reduction competitive ≥7.5% ilmenite (mare)              |
| lox_energy_allin        | 11.3                                                  | 9–15                     | kWh/kg            | mining→electrolysis→cryo chain                              |
| electrolysis_energy     | 5.0                                                   | 4.5–6.0                  | kWh/kg H₂O split  | stoich 8:1 O₂:H₂ by mass                                    |
| fission_unit            | {power: 40 kWe, mass: 6000 kg, life: 10 yr}           | —                        | —                 | NASA FSP spec                                               |
| rtg_unit                | {power: 0.4 kWe, mass: 50 kg}                         | 0.1–1 kWe                | —                 | night keep-alive                                            |
| solar_specific_power    | 100                                                   | 80–150                   | W/kg              | deployed array class                                        |
| battery_specific_energy | 200                                                   | 150–300                  | Wh/kg             | Li-ion class                                                |
| rfc_specific_energy     | 600                                                   | 400–1000                 | Wh/kg             | regenerative fuel cell, night-scale storage                 |
| crop_area_per_person    | 45                                                    | 40–50                    | m²                | full caloric diet                                           |
| crop_led_power          | 300                                                   | 200–500                  | W/m²              | dominant food-energy cost                                   |
| dv_tli                  | 3150                                                  | 3100–3250                | m/s               | LEO→TLI                                                     |
| dv_loi                  | 1000                                                  | 900–1100                 | m/s               | lunar orbit insertion                                       |
| dv_descent              | 1900                                                  | 1800–2000                | m/s               | orbit→surface                                               |
| dv_ascent               | 1900                                                  | —                        | m/s               | surface→orbit                                               |
| comm_delay_oneway       | 1.28                                                  | —                        | s                 | Earth–Moon                                                  |
| transit_days            | 4                                                     | 3–5                      | days              | typical cargo/crew transit                                  |
| micrometeorite_flux     | site const                                            | —                        | events            | see EVENTS.md tables                                        |
| moonquake_major_rate    | 0.3                                                   | 0.1–0.5                  | events/yr         | shallow quakes felt at base                                 |
| launch_failure_p_clps   | 0.5→0.15                                              | —                        | per mission       | Realistic mode: historical 50% early, improving with tech   |
| launch_failure_p_heavy  | 0.05                                                  | 0.02–0.08                | per mission       | mature heavy lift                                           |
| cost_per_kg_surface     | tiered                                                | 1.0M / 250k / 100k / 10k | $/kg              | legacy / CLPS / heavy / Starship-class target (speculative) |

(See data/base/constants.json for the machine-readable version with `source` strings.)

---

## 2. Environment Model

**Clock.** `lunarPhase = (tick mod 708.7) / 708.7`. Tile illumination: `lit(tile, phase)` from the map's illumination class:

- Class A (eternal-light ridge): lit fraction 0.90 of cycle, short eclipses clustered.
- Class B (standard polar): 0.5 lit.
- Class C (PSR): 0.0, temp pinned at temp_psr.

**Surface temperature** (non-PSR): sinusoidal between temp_night_min and temp_day_max lagged 1–2 ticks behind illumination. Buildings exchange heat with environment per §5.

---

## 3. Power System

Per tick: `generation = Σ producers`, `demand = Σ consumers (by priority tier)`.

- Solar array: `P = ratedW × lit(tile) × (1 − dustDegradation)`. dustDegradation grows per EVA/landing near unpaved tiles (EVENTS.md §dust), cleaned by maintenance task.
- Fission: flat 40 kWe per unit; refuel/replace at 10-yr life.
- Storage: charge with surplus (round-trip efficiency: battery 0.90, RFC 0.55).
- Deficit: shed priority tiers bottom-up — Tier 3 industry → Tier 2 comfort/research → Tier 1 thermal → Tier 0 life-support. Tier 0 unmet ⇒ ECLSS degradation cascade (see §6).

**Design intent:** the 14-day night is the recurring boss fight. Early game: oversized batteries/RFC or RTG keep-alive + crew evacuation. Mid: fission. Late: distributed grid + redundancy.

---

## 4. Radiation Model

- Chronic: each crew member gains `dose_surface_chronic × exposureFraction` per day. Indoors: multiply by shielding factor `S(g/cm²)`:
  - S(0)=1.0 · S(10)=0.7 · S(50)=0.5 · S(180)=0.75×? — NOTE: GCR secondaries make intermediate thickness (45–105 g/cm²) slightly WORSE; implement S as a lookup table with the published bump, floor 0.35 at ≥300 g/cm² (buried/lava tube ≈ 0.05).
- SPE event (EVENTS.md): delivers 100–500 mSv over 12–48 ticks to anyone with <spe_shelter_min coverage; ≤10 mSv inside ≥spe_shelter_safe shelter. Warning lead time 12–48 ticks (space-weather tech improves it).
- Rules engine: rolling 30-day dose >250 mSv ⇒ radiation sickness debuff (health −, work −); career >600 mSv ⇒ forced Earth return (or permanent health penalty if colony can't return them).

---

## 5. Thermal Model (per building)

`Q_net = Q_internal (equipment + crew×137 W) + Q_solar_absorbed − Q_radiated(radiator area, T⁴) − Q_conducted(environment)`

Simplify: each building has `heatGenW`, `radiatorW` (rated at day conditions; ×1.6 effective at night), `insulationClass`. State machine: NOMINAL → OVERHEAT (>310 K internal: equipment efficiency −25%, then damage) / FREEZE (<273 K: water systems offline, then damage). Night heating draws Tier-1 power: `heaterW = k × (T_target − T_env) / insulationClass`.

**Implemented model parameters (M2, machine-readable in data/base/constants.json):** thermal management applies to active buildings only (`heatKw > 0` or `powerKw < 0`); passive structures (solar arrays) degrade via dust/wear instead. Envelope conductance scales with size: `U = thermal_leak_kw_per_k_per_tonne (0.00083, needs_source) × massKg/1000` (12 t hab → 0.01 kW/K). Thermal mass `C = massKg × building_specific_heat (1.0 kJ/kg·K, needs_source) / 3600` kWh/K. Setpoint `temp_internal_target = 295 K` (needs_source); freeze 273 K / overheat 310 K thresholds as above; heater capped at `heater_max_kw = 5` per building (needs_source); damage `thermal_damage_rate_per_hour = 0.002` condition/h outside the band (needs_source). Radiators throttle to hold the setpoint; `radiatorShared` wings (ISS-HRS style) pool their capacity base-wide, allocated in entity order; heater requests are posted one tick ahead as Tier-1 demand (deterministic Env → Power → Thermal order).

---

## 6. ECLSS Model

Per person-day (divide by 24 per tick):

- O₂ store −0.84 kg; CO₂ store +1.00 kg (scrubbed at scrubber capacity; unscrubbed CO₂ > threshold ⇒ health debuffs ⇒ death cascade).
- Water: potable −3.54 kg; hygiene −3.5 kg (configurable); wastewater × eclss_water_recovery returns to potable; brine loss = remainder.
- Food −0.62 kg dry. Variety score (≥4 crop types) gives morale bonus.
- Sabatier (if built): consumes CO₂ + H₂ (4:1 molar) → CH₄ + H₂O; closes O₂ loop when paired with electrolysis; CH₄ stored (future propellant) or vented.
- Closure metric (colony stat): `closure% = 1 − importedConsumablesMass / totalConsumablesMass` (rolling lunar day). Drives Phase 3/4 transitions.

Failure cascade order (legibility rule): power loss → scrubber stops → CO₂ warning (24–48 tick grace) → health damage → death. Each step fires an alert with cause chain.

**Implemented model notes (M3, machine-readable in data/base/constants.json):** consumables draw from a colony-wide pool in ascending entity order (per-habitat atmospheres arrive with EVA/airlock mechanics); "atmosphere" CO₂ lives in housing/shelter volumes until a scrubber concentrates it into its machine store. OGA electrolyzes water → O₂ 0.89 / H₂ 0.11 toward a reserve of `o2_reserve_target_days` (3, needs_source) of crew demand. Cabin CO₂ proxy thresholds: warning 0.5 / danger 1.0 kg per person (needs_source), damage after `co2_grace_ticks` (36, from the 24–48 range above). Shortage damage rates (all needs_source): hypoxia 20 health/h, dehydration 12/day after 24 h, starvation 2.5 health/day + 10 morale/day (morale collapses first — the legible chain). Wastewater out ≈ water drawn; the recycler's unrecovered fraction is brine loss until brine-processor tech.

---

## 7. ISRU Reactions (data-driven; canonical set)

| Reaction                  | Inputs                                    | Outputs                                       | Energy                   | Building                                         |
| ------------------------- | ----------------------------------------- | --------------------------------------------- | ------------------------ | ------------------------------------------------ |
| Ice mining                | PSR regolith (tile ice%)                  | icy regolith                                  | 0.5 kWh/kg               | Ice Harvester (cold-rated)                       |
| Ice extraction            | icy regolith                              | water (tile ice% × mass), dry regolith        | 1.5 kWh/kg water         | Volatile Oven                                    |
| Electrolysis              | water 1 kg                                | O₂ 0.89 kg + H₂ 0.11 kg                       | 5.0 kWh/kg               | Electrolyzer                                     |
| MRE                       | regolith 100 kg                           | O₂ 28 kg + metal slag 30 kg (Fe/Si/Al/Ti mix) | 33 kWh/kg O₂             | MRE Plant                                        |
| Ilmenite reduction        | mare regolith (ilm ≥7.5%) + H₂ (recycled) | water → loop, Fe, TiO₂                        | 12 kWh/kg O₂-equiv       | Reduction Plant                                  |
| Sabatier                  | CO₂ 44 + H₂ 8 (kg-mol ratio)              | CH₄ 16 + H₂O 36                               | exothermic (net ~0)      | Sabatier Unit                                    |
| LOX liquefaction          | gas O₂                                    | LOX                                           | 11.3 kWh/kg all-in chain | Cryo Plant                                       |
| Metal refining            | slag                                      | Fe / Al / Si / Ti ingots                      | 8 kWh/kg                 | Refinery                                         |
| Regolith printing         | regolith + binder(early)/sinter(late)     | structure mass                                | 2 kWh/kg                 | Regolith Printer                                 |
| He-3 extraction (Phase 5) | regolith 100 t                            | He-3 ~1–2 g + volatiles (H₂, H₂O, N₂)         | heat to 700 °C, 50 kWh/t | Volatile Combine (speculative economics flagged) |

Mass balance is exact in data; the schema requires inputs Σmass = outputs Σmass (± declared vented loss).

**Implemented notes (M4):** throughput comes from the hosting building's `reactionKgPerDay` (primary-output kg/day), throttled by duty = power × condition × staffing (unstaffed floor 0.5 → 0.8 with automation_robotics) and gated by reaction `minTempK`. Ice mining is a building `mining` capability whose yield splits by the tile's true ice fraction; MRE plant throughput follows the MIT/Schreiner plant sizing rather than the theoretical 33 kWh/kg (which would overstate small-plant output). The "≥50% local O₂+water" metric counts mining and ISRU-reaction output only — recirculation (water recycler, OGA, Sabatier, electrolysis conversions) is excluded so an ISS-style recycler cannot satisfy an ISRU milestone.

---

## 8. Logistics & Orbital Model

No full orbital sim in v1 — a parameterized abstraction grounded in real delta-v:

- Mission = {vehicleClass, payloadKg, costUSD = payloadKg × tier $/kg, transitTicks = transit_days×24, failureP by mode/tech}.
- Launch windows: departures allowed any tick (Earth→Moon is forgiving) but arrivals during local night at unlit pads add landing risk +5% without nav beacons (tech).
- Starship-class missions require `orbital_refueling` tech and have a setup latency (tanker chain) of 30 days first use.
- Crew rotation missions: 4–6 seats; crew >180 days without rotation accrue morale/health penalties until Phase 4 norms.

**Implemented notes (M5):** vehicle classes live in constants (`vehicle_clps/mid/heavy/starship`: payload cap, $/kg, ideal/realistic failure p, transit days); Starship requires orbital_refueling; night arrivals add `night_landing_penalty` without night_landing_nav; realistic CLPS failure caps at 0.15 with precision_landing (PHASES.md P0). Probe and sortie missions are abstracted (success → landings/sorties counters, science grants); crewed-fatality subtleties and rotation arrive with later milestones.

---

## 9. Crew Model

Attributes: health 0–100, morale 0–100, doseCareer mSv, dose30d ring buffer, skills {pilot, engineer, scientist, medic, agronomist}, location.

- Morale inputs: habitat space/person, food variety, comms with Earth (delay flavor), crisis frequency, crowding, lighting during night, recreation modules.
- Health drift: −0.5/month bone/muscle baseline, fully offset by 2 h/day exercise capacity; medical events per EVENTS.md; clinic capacity heals.
- Work: buildings list `crewOps` (person-hours/day by skill). Unstaffed ⇒ output ×0.5 (automation tech raises floor).

**Implemented model notes (M3):** drift offset uses powered exercise-service slots covering crew in entity order (explicit assignment later). Radiation sickness damage scales with the rolling-dose excess over the 250 mSv limit (`radiation_sickness_health_per_day` × min(1, excess/limit)) — a marginal exceedance is an illness, not a death sentence. Medical events draw at the EVENTS.md ideal rate (0.05/crew-year); medkits and clinic capacity reduce severity; clinics heal lowest-health first at `clinic_heal_per_day`, burning `clinic_medkit_per_patient_day`. Morale: baseline 70, recovery 2/day capped at baseline, crowding −5/day scaled by the overflow fraction (all needs_source). Career dose >600 mSv raises a standing forced-return flag (acted on by crew rotation, M5).

---

## 10. Determinism & Numerics

- Single mulberry32 RNG in world; systems draw in fixed registry order.
- All state floats stored as f64 but quantized at tick end (round to 1e-9) to suppress platform drift; golden hash on quantized state.
- Commands sorted by (tick, sequence) before apply.

---

## 11. Validation Targets (face-validity tests)

- A 4-crew outpost with 40 kWe fission, standard ECLSS, monthly 2 t resupply should be stable indefinitely (matches Artemis Base Camp intent).
- MRE small plant produces ~1 t O₂/yr ⇒ supports ~3.3 people's O₂ — verify emergent ratio.
- LOX for one 15 t-propellant ascent ≈ 13 t LOX ⇒ ~147 MWh ⇒ ~42% of a 40 kWe unit-year. Propellant economy must therefore demand MW-scale power — the sim should reproduce this conclusion naturally.

---

**Implemented notes (M7):** greenhouse photosynthesis closes mass exactly as the inverse of crew metabolism (1.00 CO₂ + 0.46 H₂O → 0.62 dry food + 0.84 O₂ per person-day equivalent at 45 m²/person); farms feeding ≥half the diet lift the morale baseline by resh_food_morale_bonus. The closure% stat counts ALL locally created mass vs imports per cycle (recirculation and raw excavated regolith excluded). Manufacturing chain: MRE slag → refinery iron (0.5 yield) → workshop spare parts (1:1.1 with a 0.1 components fraction) → consumed by the M4 maintenance budget; the fab plant closes machine-components except a 5% imported electronics fraction. He-3: 1.5 g per 100 t regolith at ~/kg into a deliberately tiny elastic market (he3_demand_kg_per_day, speculative) — flooding it is the intended Phase-5 economics lesson; a powered mass driver multiplies reachable LOX demand (mass_driver_demand_multiplier, speculative). Population: immigration waves every immigration_wave_days gated by housing AND food runway or farm coverage; births from Phase 4 with partial-g countermeasures plus medical capacity.
