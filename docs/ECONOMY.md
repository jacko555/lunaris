# ECONOMY.md — Resources & Production Chains

## 1. Resource list (data/base/resources.json)

**Raw:** regolith (highland), regolith (mare/ilmenite), icy regolith, water ice
**Fluids/gases:** water, O₂ (gas), LOX, H₂, LH₂, CO₂, CH₄, N₂ (imported buffer gas), He-3 (Phase 5), volatiles mix
**Solids:** metal slag, iron, aluminium, silicon, titanium, TiO₂, regolith blocks/printed structure, glass/ceramics
**Manufactured:** spare parts, machine components, electronics (import-only until late tech), solar cells (late: in-situ Si), binder/polymer (import early)
**Consumables:** food (dry mass; variety subtypes wheat/potato/soy/greens/protein), medkits, EVA consumables (suit O₂/scrubber cartridges)
**Abstract:** energy (kWh ledger, not stored as item), science points, budget ($), heat (ledger), crew-hours by skill

Every resource: `{id, name, phaseIntro, density, storageClass: pressurized|cryogenic|bulk|ambient, importCostPerKg?, encyclopediaRef, source}`

## 2. Canonical chains (ASCII diagrams)

### Water/propellant chain (the spine)

```
PSR tile ──Ice Harvester──► icy regolith ──Volatile Oven──► water + dry regolith
water ──Electrolyzer (5 kWh/kg)──► O₂ 0.89 + H₂ 0.11
O₂ ──Cryo Plant──► LOX        H₂ ──Cryo Plant──► LH₂
LOX+LH₂ ──► lander refuel / depot export (Phase 3+ revenue)
water ──► ECLSS potable loop top-up
```

### Oxygen/metals chain (highlands)

```
regolith ──MRE Plant (33 kWh/kg O₂)──► O₂ 28% + slag 30%
slag ──Refinery──► Fe / Al / Si / Ti
metals ──Workshop──► spare parts ──► maintenance demand sink
Si ──(late tech)──► solar cells
```

### Mare alternative

```
mare regolith (ilmenite ≥7.5%) + H₂ ──Reduction Plant──► H₂O (→loop) + Fe + TiO₂
```

### Air loop

```
crew CO₂ ──Scrubber──► CO₂ store ──Sabatier (+H₂)──► CH₄ + H₂O ──► water loop
O₂ from electrolysis/MRE ──► habitat atmosphere
```

### Construction chain

```
regolith ──Regolith Printer (2 kWh/kg)──► printed structure (hab shells, berms, pads)
printed structure: build-cost discount 60–80% vs imported mass; berm = +g/cm² shielding; pad = −dust
```

### Food chain (Phase 3◐ → 4)

```
water + nutrients(import early) + LED power (300 W/m²) ──Hydroponics──► food subtypes + O₂ bonus + crew CO₂ sink
45 m²/person full diet; partial farms scale linearly
```

### He-3 / volatiles (Phase 5, economics flagged speculative)

```
regolith 100 t ──Volatile Combine (700°C bake)──► He-3 1–2 g + H₂ + H₂O + N₂ + CO₂
He-3 export @ $20M/kg into a small elastic market (cryogenics); fusion demand = optional late event
```

## 3. Make-vs-buy economics

- Import cost tiers ($/kg to surface): legacy 1,000,000 → CLPS 250,000 → heavy 100,000 → Starship-class target 10,000 (speculative; unlocked by tech/scenario).
- Every local production building therefore has an implicit "payback mass": UI shows `paybackMonths = plantImportMass × $/kg ÷ monthlySavings`. This is the core strategic calculation of Phase 3.
- Maintenance sink: each building consumes spare parts at `wearRate` (Realistic mode ×1.5); parts imported or made (Workshop, needs metals + machine components). Mass-closure % rises as parts go local.

## 4. Budget model

- Income: scenario funding profile (annual appropriation with political-risk events), propellant/He-3/metal export contracts (Phase 3+), science prestige grants (milestones), tourism events (Phase 4+ flavor).
- Expenses: launches (payload × tier), ops $/crew/day, construction, research.
- Political risk: Realistic mode draws budget events (cut/boost/restructure) from the event deck; Ideal mode = smooth profile.

## 5. Storage & spoilage

- Cryogens boil off 0.1%/day (insulated tanks tech → 0.01%); gases need pressurized tanks (mass cost); food spoils slowly without refrigeration (negligible early, matters at scale); regolith free bulk.

## 6. Balance KPIs (tools/balance.ts must report)

- kg imported per person-month by phase (target curve: 100 → 30 → 5 → <1)
- kWh per kg of each local product vs SDD constants (drift alarm ±10%)
- Time-to-Phase-3 by mode (Ideal ~8–10 game-years from 2026 start; Realistic 12–18)
- Propellant price floor vs import parity (must cross in Phase 3 with MW power)
