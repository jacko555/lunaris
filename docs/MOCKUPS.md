# MOCKUPS.md — UI/Visual North-Star Reference

The owner supplied nine AI-generated concept mockups that define the "Mission Ops"
target look. **Drop the image files into `docs/mockups/` using the names below** —
agents should treat the file as the spec where present and this written breakdown
otherwise.

> ⚠ Realism caveats (the mockups are art, the sim is the truth): mockup 5 shows a
> _wind speed_ and weather forecast (no atmosphere on the Moon — render solar/thermal
> forecasts instead) and mockup 6 shows one habitat drawing 240 MW (six thousand
> Kilopower units; real figure is single-digit kW). Never copy mockup numbers into
> data — sourced constants are the project's moat.

| file                  | screen                 | key elements to replicate                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-crew-habitat.png` | Crew / habitat cutaway | Fallout-Shelter-style photoreal cross-section, 9 labeled room bays with crew figures; left crew roster with portraits + status; right crew-member panel (portrait, health/morale/radiation bars, skills Lv, current task ETA, workload/stress, medical notes); habitat efficiency chips strip (O₂/water/food/CO₂/waste/sleep/exercise/medical)                              |
| `02-logistics.png`    | Logistics              | Gantt of incoming/outgoing missions with day ruler; route overview LEO→TLI→LLO→descent→surface with Δv + ETA per leg and rendered craft; cargo item list (icon, mass, $/unit); manifest table with priorities + mass-utilization bar; runway days, import-dependency donut, cargo backlog, storage capacity, supply-window calendar                                         |
| `03-crisis-map.png`   | Map during SPE         | Isometric photoreal base; red emergency banner with impact countdown; shelter routes (green runner paths), shielded-zone bubble, per-building shield badges; radiation panel (Sv/h, shelter capacity, regolith shielding cm/reduction %); incident log; cause→effect chain; recommendations; emergency action buttons; radiation curve + storm intensity forecast histogram |
| `04-industry.png`     | Production chain       | Node-graph flow view: source → processor → storage/output cards with rendered thumbnails, t/h throughputs, efficiency %, bottleneck flags; power/thermal load chips in header; right detail panel for selected facility (render, status, throughput, wear, maintenance ETA, shutdown)                                                                                       |
| `05-exploration.png`  | Exploration            | Orbital photoreal terrain map with named features + elevation labels; rover roster with renders/battery/status; loadout list (instrument Mk levels); waypoint routes (dashed), suspected-ice hatched ellipses, hazard zones, comms-coverage circles; bottom strip: terrain elevation profile, route planner with alternates, environmental forecast, comms coverage donut   |
| `06-build-day.png`    | Map, build mode, day   | Isometric photoreal base; numbered node badges (01–07); lit connection roads; building list with render thumbnails + cost; overlays toolbar + SHOW RADIUS toggle; right detail: status/integrity/pressure/temp/crew, I/O per day, power usage, wear, priority tier stepper, deconstruct                                                                                     |
| `07-build-night.png`  | Map, night             | Same scene fully dark: emissive windows, lit cable runs, red-accent night UI, alerts panel with battery-depletion/thermal/SPE countdowns; "night continues 12d 22h"                                                                                                                                                                                                         |
| `08-research.png`     | Research               | Five branch columns (Transportation/Power/ISRU/Life Support/Science) × phase-gate rows; TRL chips, science costs, lock icons; selected-tech panel with rendered illustration, unlocks list, prereqs, research time; phase-gates & milestones ribbon along the bottom                                                                                                        |
| `09-observer.png`     | Observer dashboard     | Milestone timeline ribbon (years across top); 6+ chart cards with **ideal vs realistic** overlaid lines; live map preview thumbnail; event log with cause→effect chains; colony growth + resource autonomy bars; scenario-config strip (agency/start year/horizon/failure profile/policy AI/site/seed); compare-runs legend; TAKE COMMAND button                            |

## Status vs the mockups (2026-06)

Implemented: shell layout, top bar + lunar clock dial, map day/night plates with
data-truth overlay, build cards, inspector I/O, logistics gantt/route/vehicles,
industry cards + flow totals, research grid + ribbon, observer charts with
ideal-vs-realistic + timeline, exploration fleet + planning, crisis vignette +
shelter actions, run report.

Largest visible gaps: habitat cutaway screen (01), node-graph edges with thumbnails
(04), orbital exploration backdrop + route planner strip (05), numbered map badges +
radius/overlay toggles (06), portraits/cards art (P2 queue in ASSET-PLAN.md).
