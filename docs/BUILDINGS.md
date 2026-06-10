# BUILDINGS.md — Building & Module Catalog

Format per entry: tier (phase intro), real-world analogue, mass (import), footprint (tiles), power (kW, − = consumes), heat (kW), crewOps (person-h/day), inputs→outputs, notes. All values are defaults for data/base/buildings.json; balance may tune ±30%.

## Tier 0 (Phase 0) — Robotic

| Building                        | Analogue                          | Mass    | Pwr  | Notes                                           |
| ------------------------------- | --------------------------------- | ------- | ---- | ----------------------------------------------- |
| Comms Relay (orbital, abstract) | Queqiao / Crescent / LunaNet      | mission | —    | Enables far-side ops + nav; +landing success 5% |
| Nav Beacon                      | LunaNet PNT / Blue Ghost GPS-lock | 50 kg   | −0.1 | +night-landing safety                           |
| Prospector Rover                | VIPER-class                       | 450 kg  | RTG  | Surveys 1 tile/day, tightens ice uncertainty    |
| Demo ISRU Lander                | IM-2 PRIME-1 drill class          | 100 kg  | −1   | One-shot: proves ice on tile (science)          |

## Tier 1 (Phase 1) — Sortie

| Building                | Analogue                       | Mass    | Pwr  | Notes                              |
| ----------------------- | ------------------------------ | ------- | ---- | ---------------------------------- |
| Crewed Lander (vehicle) | Starship HLS / Blue Moon MK2   | mission | —    | 4 seats, 6.5-day stay, abort logic |
| Portable Shelter        | inflatable SPE shelter concept | 300 kg  | −0.5 | 10 g/cm² equiv for 4 crew, 72 h    |
| Sample Lab Kit          | Apollo ALSEP heritage          | 150 kg  | −0.3 | +science/day during sortie         |

## Tier 2 (Phase 2) — Outpost ★ MVP set

| Building                    | Analogue                     | Mass        | Footprint        | Pwr        | Heat       | CrewOps   | Notes                                             |
| --------------------------- | ---------------------------- | ----------- | ---------------- | ---------- | ---------- | --------- | ------------------------------------------------- |
| Foundation Habitat          | NASA FSH / ASI MPH           | 12 t        | 2×2              | −6         | 4          | 2 eng     | Houses 4; shielding 5 g/cm² base                  |
| Storm Shelter               | buried module / berm-covered | 3 t (+berm) | 1×1              | −0.5       | 0.5        | —         | ≥10 g/cm²; capacity 8                             |
| Solar Array 10 kW           | ROSA-class deployable        | 1 t         | 1×2              | +10×lit    | —          | 0.5 maint | Dust-degradable                                   |
| Battery Bank                | Li-ion 200 Wh/kg             | 1 t         | 1×1              | ±, 200 kWh | 0.2        | —         | RT eff 0.90                                       |
| Regen Fuel Cell             | RFC night-storage            | 2 t         | 1×1              | ±, 1.2 MWh | 1          | 0.5       | RT eff 0.55; the pre-fission night answer         |
| Fission Surface Power       | NASA FSP 40 kWe              | 6 t         | 2×2 (+1 keepout) | +40        | 8          | 1 eng     | 10-yr life; keep-out radiation zone               |
| RTG Keep-Alive              | Kilopower/RTG                | 50–300 kg   | —                | +0.4       | —          | —         | Attaches to a building                            |
| Radiator Wing               | ISS HRS-style                | 0.8 t       | 1×2              | −0.2       | rejects 15 | —         | ×1.6 effective at night                           |
| ECLSS Core                  | ISS ECLSS rack set           | 2.5 t       | in-hab           | −4         | 2          | 1 eng     | Scrubber 8 kg CO₂/d, OGA 9 kg O₂/d, water rec 93% |
| Water/Gas Storage           | tank farm                    | 1 t/unit    | 1×1              | −0.1       | —          | —         | 5 t water or 1 t gas pressurized                  |
| Comms Tower                 | DTE + Nokia LTE local        | 0.8 t       | 1×1              | −1         | —          | —         | Local network: rover/automation range             |
| Exercise Module             | ARED-class                   | 1 t         | in-hab           | −1         | 0.5        | —         | Offsets bone/muscle drift, 4 crew                 |
| Clinic                      | exam + telemedicine          | 1.5 t       | in-hab           | −1.5       | 0.5        | 1 medic   | Heals; reduces medical-event severity             |
| LTV (vehicle)               | Lunar Terrain Vehicle        | 0.8 t       | —                | solar+batt | —          | —         | Unpressurized, 2 crew, 20 km ops                  |
| Pressurized Rover (vehicle) | JAXA/Toyota Lunar Cruiser    | 6 t         | —                | −fuel cell | —          | —         | 2–4 crew, 30-day excursions, mobile mini-hab      |
| Landing Pad (printed)       | sintered pad                 | regolith    | 3×3              | —          | —          | —         | −90% dust events from landings                    |
| Regolith Berm               | bulldozed shielding          | regolith    | edge             | —          | —          | —         | +g/cm² to adjacent building                       |

## Tier 3 (Phase 3) — ISRU industrial

| Building                 | Analogue                           | Mass  | Pwr       | CrewOps | I/O summary                         |
| ------------------------ | ---------------------------------- | ----- | --------- | ------- | ----------------------------------- |
| Ice Harvester            | Interlune-class excavator (scaled) | 3 t   | −15       | 1 eng   | PSR tile → icy regolith 2 t/day     |
| Volatile Oven            | thermal extraction                 | 2 t   | −20       | 0.5     | icy regolith → water @ tile ice%    |
| Electrolyzer             | PEM stack                          | 1 t   | −25       | 0.5     | water → O₂+H₂, 5 kWh/kg             |
| Cryo Plant               | LOX/LH₂ liquefaction               | 3 t   | −30       | 0.5     | gas→cryo; chain 11.3 kWh/kg LOX     |
| MRE Plant S              | MIT/Schreiner small                | 0.4 t | −14       | 0.5     | 1 t O₂/yr + slag                    |
| MRE Plant L              | MIT/Schreiner large                | 1.6 t | −56.5     | 1       | 10 t O₂/yr + slag                   |
| Ilmenite Reduction Plant | H₂ reduction                       | 2.5 t | −20       | 1       | mare rego+H₂ → H₂O+Fe+TiO₂          |
| Sabatier Unit            | ISS Sabatier                       | 0.5 t | −2        | —       | CO₂+H₂→CH₄+H₂O                      |
| Refinery                 | slag → ingots                      | 4 t   | −40       | 1       | 8 kWh/kg metal                      |
| Regolith Printer         | ICON Olympus / D-Shape             | 3 t   | −25       | 1       | regolith → structure 2 kWh/kg       |
| Workshop                 | machine shop                       | 3 t   | −10       | 2 eng   | metals+components → spare parts     |
| Greenhouse Module 50 m²  | Veggie→scaled hydroponics          | 4 t   | −15 (LED) | 1 agro  | ~1 person's diet; +O₂, −CO₂         |
| Propellant Depot Pad     | refueling zone                     | 2 t   | −5        | 0.5     | Sells LOX/LH₂ to missions (revenue) |

## Tier 4 (Phase 4) — Settlement

Printed Habitat Block (regolith shell, houses 12, 20 g/cm²) · Lava Tube Hab (site-locked; 0.05 radiation factor, stable 253 K — cheapest safety in the game) · Agri-Dome 500 m² · Medical Center (surgery; removes evac dependence) · School/Rec Center (morale, children) · Fab Plant (machine components; electronics still import) · Water Reclamation Plant (98% closure) · Microgrid Node (power routing redundancy)

## Tier 5 (Phase 5) — Industrial export

Mass Driver Segment ×N (electromagnetic launcher; 10 MW class when complete; exports without propellant) · Volatile Combine (100 t regolith/hr; He-3 + volatiles) · Solar Farm Field (in-situ Si cells) · Beamed Power Pilot · Orbital Depot (abstract) · Spaceport Terminal (tourism/immigration throughput)

## Tier 6 (Phase 6) — City (speculative-flagged)

Crater Dome Segment (paraterraforming megaproject) · Civic Center (autonomy arc) · Mars Fleet Fuel Terminal

### Data shape

See DATA-SCHEMA.md `Building`. Every entry carries `analogue`, `source`, `phase`, `wearRate`, `shieldingGcm2`, `priorityTier` for power.
