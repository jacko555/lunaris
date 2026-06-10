# Lunar Colony Simulation Game — Master Research & Design Document Set

## TL;DR
- **Build it web-first in TypeScript with a renderer-agnostic, deterministic, fixed-timestep simulation core (ECS, data-driven JSON definitions), then port the proven core to Godot 4 for a Steam release** — Godot is the standout choice because one engine exports to both HTML5 (free hosting on GitHub Pages/itch.io/Cloudflare Pages) and Steam, is MIT-licensed, and is the model used by successful open-source games like Mindustry.
- **The simulation can be made genuinely "hard realism" using real, code-ready constants gathered here**: lunar gravity 1.62 m/s², ~29.5-day day/night cycle, surface temps +127°C/−173°C (PSRs to ~25–40 K), crew consumables 0.84 kg O₂ / 3.54 kg water / 0.62 kg food per person per day, molten-regolith-electrolysis oxygen at ~1 t O₂/yr per ~tonne of plant (highlands) at tens of kWh/kg, 40-kWe fission surface power, ~4–10 g/cm² regolith to stop solar storms but ~tonnes/m² needed against cosmic rays, and Earth→Moon delta-v of ~3.1–3.2 km/s TLI + ~0.9–1.1 km/s lunar orbit insertion + ~1.9 km/s descent.
- **The phase model and 2026-accurate program status are the backbone**: as of June 2026, Artemis II flew a crewed lunar flyby (April 1–10, 2026), NASA cancelled Gateway and restructured Artemis around a phased "Moon Base" (Artemis III is now a 2027 Earth-orbit test; first landing slips to Artemis IV ~2028), Blue Origin's New Glenn exploded on its pad (May 28, 2026) threatening the schedule, and China targets a crewed landing by 2030 with an ILRS base by 2035 — a real great-power race that gives the game both its "ideal" and "realistic" simulation branches.

---

## Key Findings

1. **Realism is achievable and fun if time is compressed and failures are legible.** The 29.5-day lunar day is the central design problem; the answer is variable time compression (1 tick = 1 hour baseline) plus the day/night power crisis as the core recurring tension (solar by day, fission/regenerative fuel cells through the 14-day night).
2. **The economy should be built on real ISRU chemistry chains** (regolith → O₂ + metals via molten regolith electrolysis; ice → H₂/O₂ propellant via electrolysis; ilmenite hydrogen reduction) with real yields and power costs, which naturally produces Factorio-like production chains grounded in physics.
3. **The 2026 program restructuring is a gift to the two-mode design**: the "ideal" simulation branch can play out the optimistic NASA/commercial timeline, while the "realistic" branch models documented failures (lander tip-overs, the New Glenn explosion, budget/Gateway cancellation, schedule slips).
4. **Godot 4 is the clear technical recommendation** for the web→Steam path; a pure-TypeScript core that is engine-agnostic de-risks the port and maximizes open-source contribution.
5. **Licensing is the single most important early decision**: to keep a later paid Steam port possible while accepting outside contributions, the project must adopt a CLA/copyright-assignment from day one (the Mindustry/Audacity model) and separate code and art-asset licenses (the OpenTTD/0 A.D. pattern).

---

## Details

### 1. LUNAR SCIENCE & PHYSICS FOUNDATION (simulation constants)

**Gravity & mechanics**
- Surface gravity **1.62 m/s²** (≈1/6 g). Effects to model: ballistic dust (no atmosphere to suspend it), 6× jump height, reduced traction/excavation reaction forces, slower settling of thrown regolith, bone-density/muscle-atrophy health drift for crew.
- Escape velocity 2.38 km/s; no atmosphere → no aerobraking, no weathering, full micrometeorite flux.

**Day/night & thermal**
- Synodic day **≈29.5 Earth days** (~14.75 days light, ~14.75 dark).
- Surface temperatures: **day ≈+127°C (400 K), night ≈−173°C (100 K)**; permanently shadowed regions (PSRs) measured as low as ~25–40 K. Lava-tube interiors are thermally stable (~−20°C; some pit interiors ~17°C year-round).
- Thermal management is a hard constraint: radiators must reject heat to space; night survival requires stored power/heat.

**Radiation (code-ready)**
- Unshielded surface dose ~**0.4–0.6 mSv/day** GCR-dominated; effective ~200 mSv/yr unshielded (one DLR model: ~200 mSv/yr behind 180 g/cm² regolith — only ~25% reduction, because of GCR secondaries).
- NASA limits: **250 mSv/30-day** short-term cap; Moon 6-month goal **<150 mSv**; career limit historically 600 mSv.
- **Solar particle events (SPE):** **>4 g/cm² regolith** drops a major SPE below the 30-day limit; **>10 g/cm²** gives a factor-2 margin (~3.3 cm of regolith).
- **GCR:** essentially uneconomical to "stop" — needs **tonnes per m²**; regolith helps modestly and can even worsen dose via secondary neutrons between ~45–105 g/cm². Design implication: storm shelters (thick) + accept chronic GCR, or go underground/lava tube.
- Standard shielding metric: areal density g/cm² (regolith bulk density ~1.5–1.6 g/cm³ loose).

**Regolith composition (oxides, for ISRU)**
- O is ~**45 wt%** of regolith (bound in oxides). Major minerals: plagioclase feldspar (anorthite, Ca-rich), pyroxene, olivine; oxides ilmenite (FeTiO₃) and spinels.
- **Mare:** higher FeO/TiO₂; ilmenite up to ~15–20% in high-Ti mare basalts; anorthite lower. **Highlands:** anorthite up to ~60%, ilmenite ~0.5%.
- Hazards: dust is sharp/abrasive (no weathering), clings electrostatically, levitates at the terminator; health hazard (lung), mechanical (seals, bearings, radiators), and degrades solar panels.

**Water ice**
- PSR cold traps at both poles. Estimated lunar-delivered water historically: between ~130 million and ~4.3 billion metric tons. Per-crater estimates: Cabeus ~11 Mt, Shoemaker ~5 Mt, Faustini ~4 Mt, de Gerlache ~3 Mt, Haworth ~3 Mt. Per Colaprete et al. (2010), via NASA/LCROSS, the concentration of water ice in the regolith at the LCROSS impact site (Cabeus) is estimated at **5.6 ± 2.9% by mass**, with a maximum total water vapor and ice within the instrument field of view of 155 ± 12 kg. Extraction is hard: cryogenic (ice under up to ~40 cm of dry regolith in places), in permanent shadow (no solar), at high latitude.

**Geography / habitat sites**
- South Pole: Shackleton crater rim, "peaks of (near-)eternal light" (~90% illumination → near-continuous solar), adjacent PSRs for ice. NASA's Moon Base is sited near the south pole.
- Lava tubes (Marius Hills skylight ~65 m wide, ~36 m deep; Mare Tranquillitatis pit): tubes possibly >300 m diameter under ~40 m basalt, stable ~−20°C, dropping micrometeorite/radiation flux by >99% — premier shielded habitat sites.

**Orbital mechanics (delta-v budget, code-ready)**
- LEO→TLI ~**3.1–3.2 km/s**; lunar orbit insertion ~**0.9–1.1 km/s**; descent to surface ~**1.8–1.9 km/s**; ascent similar. NRHO (the former Gateway orbit): perilune ~3,400 km / apolune ~70,000 km, period ~6.5 days, station-keeping only ~tens of mm/s/yr.
- Communication delay Earth–Moon ~**1.28 s one way** (~2.6 s round trip); far side has no direct line of sight → needs relay satellites (e.g., Queqiao for China; ESA Lunar Pathfinder).
- Moonquakes: shallow/deep + thermal; generally weak but long-ringing (no water damping) — model as rare structural-stress events.

### 2. IN-SITU RESOURCE UTILIZATION (real chemistry & rates)

- **Molten Regolith Electrolysis (MRE):** direct electrolysis of molten regolith → O₂ at anode, molten Fe/Si/Al/Ti at cathode. Yields (MIT/Schreiner; NASA): a ~400 kg, 14 kW plant → 1,000 kg O₂/yr (highlands); a ~1,593 kg, 56.5 kW plant → 10,000 kg O₂/yr; ~1-tonne plant → ~10 t O₂/yr. Energy ~**26–40+ kWh/kg O₂** (estimates range widely, up to ~420 kWh/kg in pessimistic reviews). ~40% of regolith mass is O₂; ~280 kg O₂ recoverable per 1,000 kg processed.
- **Hydrogen reduction of ilmenite:** FeTiO₃ + H₂ → Fe + TiO₂ + H₂O; electrolyze water → O₂ + recycle H₂. Competitive when ilmenite ≥7.5 wt% (favors mare).
- **FFC-Cambridge / molten salt electrolysis:** produces metals + O₂; salt ratio is the key feasibility parameter.
- **Ferrosilicon via MRE** was found most mass-efficient: ~6,776 kg hardware + ~311 kW → 25 t/yr metal + 23.9 t/yr O₂ (mass payback ratio 0.14).
- **Water electrolysis for propellant:** producing ~2,178 t LOX/yr modeled at ~2.8 MW (~11.3 kWh/kg LOX) including mining, electrolysis, cryocooling.
- **Construction:** ESA/Foster+Partners D-Shape printed a 1.5-tonne block from simulant + binder; solar sintering (DLR) and ICON's "Olympus"/Laser Vitreous Multi-material Transformation melt regolith into ceramic structures; selective separation sintering for parts. Uses: habitats, radiation berms, roads, landing pads.
- **Solar cells from regolith:** silicon extractable via MRE; in-situ PV fabrication is a late-tech option.

### 3. LIFE SUPPORT & HABITATION

**Crew consumables (per person per day, code-ready):**
- Per NASA JSC Advanced Life Support data (cited in NASA NTRS ICES-2017-87), each standard crewmember consumes **0.84 kg/crewmember-day of oxygen** and produces **1.00 kg/crewmember-day of carbon dioxide**, with **0.62 kg food** and **3.54 kg water** consumed daily — values based on an average metabolic rate of 136.7 W/person and a respiration quotient of 0.87. Outputs also include ~0.11 kg solid waste and ~3.9 kg liquid waste. Total ~5 kg/person/day in, ~5 kg out (water roughly doubles with hygiene use).
- ISS ECLSS recovers **~90→98% of water** (Brine Processor Assembly pushed 93–94%→98%). Oxygen Generation Assembly: 2.3–9 kg O₂/day (nominal ~5.4 kg).
- **Sabatier:** CO₂ + 4H₂ → CH₄ + 2H₂O (closes O₂ loop, vents/uses methane).

**Food production:**
- **~40–50 m²** of high-light crops per person for a full caloric diet; ~35–40 m² with insects for protein/waste; ~28–40 m² for 50% calories + full air/water revitalization (NASA). MELiSSA's optimized 6-crew menu needed **453 m²**. Baseline crops: potato, sweet potato, wheat, rice, soy, peanut, lettuce, tomato, carrot, etc. LED energy is the dominant cost.
- Caloric need ~2,000–2,700 kcal/person/day.
- Closed-loop lessons: Biosphere 2 (O₂ crash, CO₂ swings) and MELiSSA (compartmentalized microbial + plant loop) show full closure is extremely hard — model partial closure % as a tech-upgradable parameter.

**Habitats:** inflatable (Sierra Space LIFE / former Bigelow), rigid metallic modules, regolith-covered, buried, and lava-tube. ASI Multi-Purpose Habitat now part of NASA Phase 3.

**Power:**
- South-pole solar (~90% illumination) + storage for eclipse; lunar night needs **fission or regenerative fuel cells**.
- **NASA Fission Surface Power:** per NASA's FSP RFP, the system "should be able to provide **40 kWe of continuous power for at least 10 years**... It must fit within a **4-meter-diameter cylinder, 6 meters in length** in the stowed launch configuration, and weigh **less than 6000 kg**," and switch itself on/off autonomously (40 kW ≈ enough to run ~33 US households). Targeted for deployment by ~2030 (per White House EO and Lockheed Martin work; also a 10-kWe class demo). Heritage: Kilopower/KRUSTY (2018, ~1 kWe demo).
- Radioisotope (RTG/RHU) for small loads through the night (in NASA Phase 1).

### 4. NASA ARTEMIS & U.S. POLICY (current to June 2026)

**The two provided URLs:**
- **nasa.gov/moonbase (updated May 26, 2026):** NASA's "Moon Base" is the centerpiece of Artemis — a sustained human presence near the **lunar South Pole**, built in a phased "Build, Test, Learn" → "Establish Early Infrastructure" → "Enable Long-Duration Human Presence" progression, with CLPS deliveries, the Lunar Terrain Vehicle, and international modules.
- **nasa.gov "NASA Unveils Initiatives to Achieve America's National Space Policy" (RELEASE 26-026, Mar 24, 2026, the "Ignition" event):** Administrator **Jared Isaacman** committed to "return to the Moon before the end of President Trump's term, build a Moon base." Key announced changes: (a) **standardize SLS**, add a mission in 2027, then **≥1 surface landing per year**; (b) **Artemis III (2027) becomes an Earth-orbit integrated-systems test** ahead of the **Artemis IV lunar landing**; (c) **pause/cancel Gateway in its current form**, redirect to surface infrastructure; (d) post-Artemis V shift to **commercial, reusable hardware**, landings every 6 months; (e) three-phase Moon Base with **JAXA pressurized rover** (Phase 2), **ASI Multi-Purpose Habitats + CSA Lunar Utility Vehicle** (Phase 3); (f) ISS-anchored commercial-LEO transition; (g) **Space Reactor-1 "Freedom"** nuclear-electric spacecraft to Mars before end of 2028; (h) **CLPS cadence up to 30 robotic landings starting 2027**; (i) VIPER and LuSEE-Night among near-term payloads.

**Artemis timeline (2026-accurate):**
- Artemis I: uncrewed, Nov 2022.
- **Artemis II: crewed lunar flyby, launched April 1, 2026, splashed down April 10, 2026** (Wiseman, Glover, Koch, Hansen); closest approach 4,067 mi above surface; first crew beyond LEO since Apollo 17.
- **Artemis III: now a 2027 Earth-orbit test** (Orion rendezvous/docking with HLS).
- **Artemis IV: first crewed landing, targeted ~2028** (SpaceX Starship HLS).
- **Artemis V: introduces Blue Origin Blue Moon lander.**
- **Gateway (PPE, HALO, I-Hab): CANCELLED March 24, 2026.**

**HLS:** SpaceX Starship HLS (Artemis III/IV) requires multiple tanker launches + LEO propellant depot + NRHO loiter up to 100 days; Blue Origin Blue Moon MK2 (Artemis V). NASA OIG flagged Starship's limited manual-control and the complex refueling architecture as risks.

**CLPS results (real, for the "robotic precursor" phase):**
- Astrobotic **Peregrine** (Jan 2024): propulsion leak, failed, no landing.
- Intuitive Machines **IM-1 Odysseus** (Feb 2024): first commercial soft landing but tipped on its side.
- **IM-2 Athena** (Mar 6, 2025): landed sideways in a crater near Mons Mouton, mission ended early.
- **Firefly Blue Ghost M1** (landed Mar 2, 2025, Mare Crisium): **first fully successful commercial lunar landing**; 10 NASA payloads; full lunar-day operation. Firefly later IPO'd (~$1B raise).
- Of four CLPS landings, only Blue Ghost was a complete success; NASA's portion of the four was ~$386M combined (vs ~$2B for one traditional mission). ~$1.5B awarded for 12 missions through 2028.
- Blue Ghost M2 (far side, ESA relay), IM-3, Draper/ispace APEX (Schrödinger far side) upcoming.

**LunaNet/PNT:** NASA LunaNet comms-and-navigation architecture; lunar relay/PNT being developed (Crescent Space/Lockheed; ESA Moonlight; first GPS-lock-from-Moon attempted by Blue Ghost).

**International:**
- **China ILRS** with Russia + partners (South Africa, Belarus, Azerbaijan, Venezuela, Pakistan, Egypt, Thailand, Senegal, etc.). Chang'e-6 (2024) far-side sample return done; **Chang'e-7 (~late 2026)** south-pole ice prospecting + relay; **Chang'e-8 (2028)** ISRU + 3D-print construction test. **Crewed landing by 2029–2030** (Long March 10, Mengzhou crew craft, Lanyue lander, Wangyu suit). **ILRS basic station by 2035, expanded by 2045.**
- India Chandrayaan-3 (2023 south-pole landing); Japan SLIM (2024 precision landing, tipped); plus JAXA pressurized rover for Artemis.

**Space law:** Outer Space Treaty 1967 (118 parties) — no national appropriation, peaceful use, no WMD. **Artemis Accords: 67 signatories as of May 7, 2026** — per the US Department of State / NASA, "On May 7, 2026, Paraguay became the 67th nation to sign the accords" (31 in Europe, 16 in Asia, 8 in South America, 5 in North America, 5 in Africa, 2 in Oceania). The Accords are non-binding, affirm resource extraction is "use" not "appropriation," and create "safety zones." The Moon Agreement (1979) was signed by almost no major spacefaring nation. China/Russia remain outside the Accords.

### 5. COMMERCIAL INDUSTRY & FUTURE LUNAR ECONOMY (2026)

- **SpaceX Starship:** by mid-2026, ~12 integrated flight tests; first **V3** flight largely successful; Super Heavy catches demonstrated repeatedly; orbital propellant transfer + Starlink V3 deployment in active testing; HLS crewed landing targeted 2027 (now Artemis IV). Stated payload ~100+ t to surface; cost target <$100/kg LEO at scale. (Note: many performance claims are SpaceX targets/projections, not yet demonstrated.)
- **Blue Origin:** New Glenn first flight Jan 16, 2025; first booster landing Nov 13, 2025; **New Glenn exploded on Launch Complex 36 during a static fire May 28, 2026**, destroying the vehicle and heavily damaging its only operational pad (rebuild may take >1 year), jeopardizing Blue Moon MK1/MK2 and NASA lunar-rover launches. New Glenn 9×4 super-heavy variant in development. Bezos vision: "millions of people living and working in space."
- **Other:** Intuitive Machines, Firefly (public), ispace (HAKUTO-R M1/M2 both crashed), Astrobotic (LunaGrid power service), Astrolab (FLEX/FLIP rover), Lunar Outpost, Venturi (rover wheels/batteries). Infrastructure: **Nokia lunar 4G/LTE** (flew on IM-2), Honeybee Robotics, Redwire, Sierra Space, Axiom (AxEMU suit w/ Prada), Crescent Space (Lockheed comms).
- **Lunar resource companies:** **Interlune** (He-3): per the Interlune/Vermeer press release (May 7, 2025), a full-scale excavator "designed to ingest **100 metric tons** of Moon dirt, or regolith, **per hour**." NASA STMD awarded an SBIR Phase III "firm-fixed-price of **$6.9 million over the next 18 months**" (announced May 4, 2026), and Interlune reports "nearly **$500 million in binding purchase orders**." DOE deal to deliver 3 L He-3 by 2029; He-3 ~**$20M/kg** (quantum-computing cryogenics demand near-term, fusion long-term/speculative). Estimated ~1.1 Mt He-3 on the Moon.
- **He-3 fusion economics: largely hype near-term** — no commercial He-3 fusion reactor exists; the real near-term market is dilution-refrigerator cryogenics and neutron detection, not fusion. Model He-3 as a high-value/low-mass export with speculative demand.
- **Market size:** Helium-3 market projected to a few hundred million to ~$1B by the early 2030s (one vendor estimate: ~$972M by 2032, ~9.9% CAGR; lunar-regolith He-3 segment >35% CAGR but from a tiny base). Broader cislunar/lunar economy projections vary widely and are speculative — present as scenarios, not facts.
- **Cislunar economy logic:** lunar water→LOX/LH₂ propellant depots to refuel Mars-bound or GEO missions ("gravity well" advantage), platinum-group metals, space solar power, and vacuum/low-g manufacturing (fiber optics, pharma) are the recurring export theses.

### 6. PHASES OF LUNAR COLONIZATION (the game's eras)

(Aligns with NASA's 3-phase Moon Base, extended to a far-future settlement arc.)

- **Phase 0 — Robotic Precursors/Prospecting** (now–~2028): CLPS landers, orbital ice mapping, VIPER-class rovers. Pop 0. Power kW. Tech: landing, prospecting, relay comms. Risk: landing failure (real base rate ~50%).
- **Phase 1 — Crewed Sorties** (Apollo/Artemis IV style, ~2028–early 2030s): days-long surface stays, 2–4 crew. Power 10s kW. Risk: launch/landing, radiation timing vs SPE.
- **Phase 2 — Outpost / Rotating Crews** (Artemis Base Camp / Antarctic model): 4–8 crew, intermittent occupation, foundation habitat, LTV + pressurized rover, fission power. Power ~40 kWe. Risk: dust, ECLSS reliability, supply gaps.
- **Phase 3 — Permanent Base + ISRU**: 10s–100s people, propellant production from ice, O₂/metals from regolith, regolith construction. Power 100s kW–MW. Risk: closure %, equipment wear, medical.
- **Phase 4 — Self-Sustaining Settlement**: 100s–1,000s, closed-loop life support, local food, manufacturing, first births. Requires high mass-closure % and an industrial bootstrap (the "minimum viable industrial base"). Risk: genetic/social viability, supply-chain depth.
- **Phase 5 — Industrial Export Economy**: mass driver/launch rail, He-3/PGM/propellant export, space solar power, servicing Mars. Power 10s–100s MW.
- **Phase 6+ — Lunar City / Independence**: domed craters/paraterraforming debates, political independence, gateway to the solar system. Largely speculative — flag as such.
- **"Self-sustaining" reality:** requires near-total mass closure (food/air/water), local spare-parts manufacturing, energy autonomy, and a deep enough industrial base that Earth resupply is optional. Genetic-viability estimates for a fully independent founding population range from ~160 (minimum, managed) to several thousand — present the range, not a single number.

### 7. GAME DESIGN RESEARCH (comparables & mechanics)

- **Surviving Mars:** dome-based colony builder; resource balance (O₂/water/power/food), drones, research tree, "Mysteries," terraforming, colonist needs/specializations, independence endgame. Lesson: readable resource icons, specialization synergy, sandbox + scenario sponsors. The two-mode idea maps to its sandbox vs scenario sponsors.
- **Oxygen Not Included:** deep systemic sim (gas/liquid/thermal), "your worst enemy is yourself," steep but rewarding; pausing + planning. Lesson: emergent failure from systems = replay value, but onboarding is brutal — needs tutorialization.
- **Factorio / Satisfactory / Dyson Sphere Program:** production-chain mastery, throughput optimization, logistics — direct model for the ISRU economy.
- **RimWorld:** story-generator events, colonist mood/health, modding ecosystem — model for crew psychology and emergent narrative.
- **Kerbal Space Program:** real-ish orbital mechanics made playable — model for the transfer/delta-v layer.
- **Stationeers:** hard ECLSS/atmospherics realism — reference for life-support depth.
- **Per Aspera:** AI-narrated planetary terraforming, automation focus.
- **Civilization / Terra Invicta:** tech trees, era progression, geopolitics — model for the phase/era spine and the international-competition layer.
- **Core loop:** prospect → land/build → power & life-support balance → ISRU production chains → expand population → research → survive crises → reach next phase milestone.
- **Making hard realism fun:** variable time compression (1 tick=1 hr, fast-forward through quiet periods, auto-pause on crises); legible failure (clear cause→effect chains); layered complexity (start with 3 resources, unlock systems); generous early failure tolerance + harder later; tooltips citing real data ("teaching" hook).
- **Two-mode design:** **Simulation mode** = configurable scenario player/observer (set parameters: budget, launch cadence, ISRU tech level, ideal vs realistic failure rates; watch the colony unfold, like a sandbox/auto-sim with speed and intervention controls) — analogous to sandbox/observer modes and to "spectator" automation in Per Aspera/SimCity. **Game mode** = hands-on base builder. Share one deterministic core; simulation mode just runs the same systems with AI/scripted decisions and exposed config.

### 8. TECHNICAL ARCHITECTURE (for Claude Code)

**Recommendation: TypeScript engine-agnostic simulation core now; Godot 4 port for Steam later.**
- **Engine comparison:**
  - **Pure web (TypeScript + PixiJS for 2D / Three.js for 3D / Canvas):** maximal control, trivial free hosting, best for the open-source web-first MVP. Con: you build more UI/tooling yourself; no native Steam path (needs Electron/wrapper).
  - **Godot 4 (RECOMMENDED for the port):** MIT-licensed (no royalties, commercial-friendly), **exports to both HTML5/WebAssembly AND Windows/macOS/Linux/Steam** from one codebase; GodotSteam integrates the Steamworks SDK; GDScript (Python-like) or C#. Caveat: Web export uses the Compatibility renderer and **C# is not supported on web in Godot 4** (use GDScript for web, or keep sim logic in the TS/GDScript core). Best single-engine answer to "free web + paid Steam."
  - **Unity:** strong tooling but WebGL export quality/size concerns and the 2023 runtime-fee/licensing controversy make it less attractive for an open-source project.
  - **Unreal:** overkill, poor web support — not recommended.
  - **Custom engine:** advise against (cost/time).
- **Simulation architecture:** **Entity-Component-System (ECS)**; **fixed-timestep deterministic tick loop** (decouple sim from render; e.g., 1 sim tick = 1 game-hour, render interpolates); **determinism** for replay/save/debug and so the "simulation mode" is reproducible; **data-driven design** — all buildings, resources, reactions, tech, events defined in **JSON/YAML** so Claude Code (and modders) can edit content without touching engine code; **Web Workers** to run the sim thread off the render thread for performance.
- **Save system:** serialize ECS world + RNG seed (deterministic) → JSON; versioned migrations. **Mod support:** load external JSON definition packs.
- **Repo structure (suggested):** `/packages/sim-core` (pure TS, no DOM), `/packages/web-client` (renderer/UI), `/data` (JSON defs), `/docs` (design docs), `/tests` (sim-core unit + deterministic golden-master tests), `/tools`. Monorepo (pnpm/Turborepo).
- **Testing:** unit-test the sim-core in isolation (deterministic given seed); golden-master/regression tests on full scenario runs; property tests for mass/energy balance invariants (no resource created from nothing).

### 9. OPEN-SOURCE LICENSING & MONETIZATION (decision-critical)

- **Proven "free OSS → paid Steam" precedents:**
  - **Mindustry (Anuken):** GPLv3; free source on GitHub + free builds from the author, simultaneously sold on Steam (~$9.99) and mobile; donation-supported, no ads/IAP. Per SteamSpy, owners are estimated at **1,000,000–2,000,000** at $9.99, and per SteamDB "Mindustry had an all-time peak of **3,376 concurrent players** on 5 May 2024." GPL permits commercial sale; buyers also get source rights.
  - **Cataclysm: DDA:** CC-BY-SA 3.0, ~1,000+ contributors, free download + paid Steam build offering convenience features (cloud saves, achievements) to fund a developer.
  - **Shapez (tobspr):** original shapez.io is GPL-3.0 with a **free web demo + paid Steam full version** hybrid (closest to the user's web-first plan); ~650k+ units sold, ~10M demo players. Note: Shapez 2 is NOT open source.
  - **OpenTTD (GPLv2)** and **0 A.D. (GPLv2 code + CC-BY-SA art)** show the **separate code/art license** pattern and clean-room asset replacement.
  - **Veloren (GPLv3, donation-only)** is a counter-example with no paid version.
- **The critical early decision — keep commercialization open:** If you accept outside contributions under pure GPL **without** a CLA, you can never relicense without unanimous contributor consent. To preserve a future paid/proprietary Godot-Steam port, adopt from day one **either (a) a Contributor License Agreement (CLA)** granting the project a perpetual, irrevocable, sublicensable copyright license (the Audacity/MuseScore model — explicitly enables App Store releases and future relicensing), **or (b) a Copyright Assignment Agreement (CAA)** (stronger, enables dual-licensing; the MongoDB model).
- **License-choice tradeoff:**
  - **Permissive (MIT/Apache):** maximum flexibility to commercialize the Godot/Steam port; downside — anyone (including competitors) can fork and sell without contributing back.
  - **Copyleft (GPL):** strong community protection; "viral" for derivatives; you can still sell on Steam (Mindustry proves it) but buyers get source rights, and you need a CLA to retain relicensing power.
- **Recommended model:** **MIT (or Apache-2.0) for the engine/sim-core + a separate license for art/music/assets (CC-BY-SA or proprietary), plus a lightweight CLA** — this maximizes contribution-friendliness AND keeps the paid-Steam port fully open while protecting the sellable "content" (the OpenTTD/0 A.D. asset-separation pattern). Flag per-title revenue-estimator figures as unofficial.
- **Hosting at zero cost:** GitHub Pages, itch.io (free, supports HTML5 + later paid builds), Cloudflare Pages.

---

## Recommendations (staged, with thresholds)

**Stage 1 — Foundations & MVP (web, single phase).** Generate the doc set (below), stand up the monorepo, build the deterministic TS sim-core with ECS + fixed timestep, and implement **one playable era (Phase 2 outpost)**: power (solar+battery+fission), ECLSS consumables, one ISRU chain (ice→water→O₂), ~6 crew, day/night cycle, 3–5 hazards. Ship to GitHub Pages. **Adopt license + CLA before the first external PR.** *Move on when:* a 50-tick scenario is deterministic/reproducible and the core loop is fun in playtests.

**Stage 2 — Vertical slice.** Add the tech tree, full resource-chain UI, the phase-progression spine (Phases 0–3), and the **two modes** (simulation/observer config + manual game). Add events/hazards (SPE storm shelter, micrometeorite, dust degradation, equipment failure, medical, supply failure, moonquake). *Move on when:* a player can progress Phase 1→3 and the simulation mode can auto-run "ideal vs realistic" branches.

**Stage 3 — Full game + Steam port.** Extend to Phases 4–6, deepen economy/closure mechanics and international competition, polish art/UX, then **port the proven sim-core to Godot 4** (GDScript) and ship to Steam via GodotSteam, keeping the web build free. *Threshold to start the port:* web version retention/wishlists justify it and the sim-core API is stable.

**Decision triggers to revisit the plan:**
- If web performance for large colonies degrades → move sim into Web Workers / WASM (or accelerate the Godot port).
- If contributor interest is high → the CLA + permissive license is validated; if low, you retain full control anyway.
- If you want maximal Steam revenue protection → keep art assets proprietary even while the engine stays open (OpenTTD pattern).

---

## Deliverable: Complete Document/File List for Claude Code

Generate these in order; each is a standalone Markdown file you can feed to Claude Code.

1. **README.md** — vision, two modes, build/run, license summary, links.
2. **CLAUDE.md** — repo conventions for Claude Code: architecture rules (sim-core must stay DOM-free/deterministic), coding standards, data-driven-content rule, test requirements, "never create resources from nothing" invariant, file map.
3. **GDD (Game Design Document)** — pillars (hard realism, two modes, open source), core loop, player fantasy, win/lose, onboarding/time-compression design, UX philosophy.
4. **Simulation Design Document (SDD)** — all physics models + a **constants table** (gravity 1.62; day 29.5 d; temps +127/−173°C; consumables 0.84/3.54/0.62 kg/p/day; ECLSS 90–98%; MRE 1 t O₂/yr/tonne @ ~26–40 kWh/kg; LOX 11.3 kWh/kg; fission 40 kWe; radiation doses & shielding g/cm²; delta-v 3.2/1.0/1.9 km/s; crop 40–50 m²/person), reaction formulas, tick model, determinism/RNG spec, mass/energy-balance invariants.
5. **Technical Architecture Document (TAD)** — ECS, fixed timestep, Web Workers, save format, mod system, monorepo layout, web→Godot port plan, testing strategy.
6. **Phase/Era Progression Spec** — Phases 0–6: population, power, tech prerequisites, costs, timelines, failure modes, transition criteria; "ideal vs realistic" branch parameters.
7. **Resource & Economy Spec** — full resource list + chain diagrams (regolith→O₂+metals; ice→H₂/O₂; ilmenite reduction; construction; He-3 export), rates/power per process, storage, trade/export economics.
8. **Building/Module Catalog** — every building with real-world analogue, inputs/outputs, power, mass, crew, footprint, tech tier (e.g., MRE plant, electrolysis, Sabatier, hydroponics bay, fission reactor, regolith printer, storm shelter, lava-tube hab).
9. **Tech Tree Spec** — nodes grounded in real **TRLs**, prerequisites, costs, unlocks, mapped to phases.
10. **Events & Hazards Spec** — SPE/solar storm (with shelter mechanic), GCR chronic dose, micrometeorite, moonquake, dust accumulation/abrasion, equipment failure/wear, medical emergency, supply-launch failure/scrub, real analogues (lander tip-over, New Glenn explosion, Gateway cancellation) — probabilities tunable per ideal/realistic mode.
11. **Two-Mode/Scenario Spec** — simulation-mode config schema (budget, cadence, tech level, failure rates, agency: NASA/China/commercial), observer controls; game-mode rules; shared core contract.
12. **UI/UX Wireframe Descriptions** — main HUD (resource bars, power/heat, day/night clock, radiation gauge), build menu, tech tree screen, crew roster/health, scenario config panel, alerts/crisis queue, time controls.
13. **Art Direction Doc** — readable/iconographic style for web (low-asset, scalable), color language for resources/alerts, lunar palette, later-Godot 3D upgrade path.
14. **Roadmap/Milestone Plan** — MVP → vertical slice → full game → Godot/Steam port, with the thresholds above.
15. **CONTRIBUTING.md + CLA** — contribution workflow, the CLA/CAA text and rationale (preserve relicensing/commercialization), code/art license split, issue/PR templates.
16. **LICENSE files** — engine license (MIT/Apache or GPL+CLA) + asset license (CC-BY-SA or proprietary), clearly separated.
17. **DATA-SCHEMA.md** — JSON/YAML schemas for buildings, resources, reactions, tech, events (the data-driven content contract).

---

## Caveats
- **Fast-moving 2026 status:** Artemis was restructured March 24, 2026 (Gateway cancelled, Artemis III→Earth-orbit test, landing→Artemis IV); the New Glenn explosion (May 28, 2026) is recent and its schedule impact is still being assessed. Treat all forward dates (Artemis IV ~2028, China 2030, fission by 2030, ILRS 2035) as targets, not guarantees.
- **Speculative/marketing content flagged:** SpaceX Starship payload/cost figures are company targets not yet demonstrated; He-3 fusion economics are largely hype near-term (real demand is cryogenics/neutron detection); lunar-economy and He-3 market-size projections vary widely and come partly from commercial market-research vendors — present as scenarios. Genetic-viability population minimums (~160 to thousands) are contested estimates.
- **ISRU/radiation numbers have wide ranges:** MRE energy estimates span ~26 to ~420 kWh/kg O₂ across studies; radiation dose and shielding effectiveness vary by model (GCR secondaries can worsen dose at intermediate thicknesses). Use ranges and make them tunable constants, not fixed truths.
- **Some sources are secondary/aggregator** (e.g., market-research and enthusiast sites); the strongest claims here are anchored to NASA, ESA, peer-reviewed/arXiv, and primary company/agency releases. Where a single secondary source carried a figure, it is flagged.