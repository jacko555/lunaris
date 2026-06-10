# DATA-SCHEMA.md — JSON Content Schemas

All game content is JSON in `data/`, validated by zod schemas in `sim-core/src/schema/`. ids are lower-case and globally unique across all categories; the convention is snake_case for constants (matching SDD table ids) and kebab-case for everything else — the schema accepts both separators. Every real-world figure carries `source` and `as_of`. Mods are packs merged by id (`override: true` replaces; otherwise duplicate id = validation error). Mod packs that reference base-pack content are loaded with `partial: true` (schema + id checks only); full referential validation re-runs on the merged result.

## Constant

```jsonc
{
  "id": "crew_o2_day",
  "value": 0.84,
  "unit": "kg/person/day",
  "range": [0.8, 0.9],
  "source": "NASA ALS / ICES-2017-87",
  "as_of": "2026-06",
  "status": "sourced",
} // sourced | needs_source | speculative
```

## Resource

```jsonc
{
  "id": "lox",
  "name": "Liquid Oxygen",
  "phase": 3,
  "storageClass": "cryogenic", // pressurized|cryogenic|bulk|ambient
  "densityKgM3": 1141,
  "boiloffPerDay": 0.001,
  "importCostPerKg": null, // null = not importable (made locally)
  "encyclopedia": "lox",
  "source": "std",
  "as_of": "2026-06",
}
```

## Reaction

```jsonc
{
  "id": "electrolysis",
  "name": "Water Electrolysis",
  "building": "electrolyzer",
  "inputs": [{ "resource": "water", "kg": 1.0 }],
  "outputs": [
    { "resource": "o2-gas", "kg": 0.89 },
    { "resource": "h2-gas", "kg": 0.11 },
  ],
  "ventedLossKg": 0.0, // schema rule: Σin == Σout + vented (±1e-6)
  "energyKwhPerKgPrimary": 5.0,
  "primaryOutput": "o2-gas",
  "heatKw": 1.2,
  "minTempK": 273,
  "source": "PEM stack typical",
  "as_of": "2026-06",
}
```

## Building

```jsonc
{
  "id": "fission-unit",
  "name": "Fission Surface Power",
  "tier": 2,
  "phase": 2,
  "analogue": "NASA FSP 40 kWe spec",
  "source": "NASA FSP RFP",
  "as_of": "2026-06",
  "massKg": 6000,
  "footprint": [2, 2],
  "keepoutRadius": 1,
  "powerKw": 40, // + produce, − consume
  "heatKw": 8,
  "radiatorKw": 0,
  "crewOps": { "engineer": 1 }, // person-hours/day by skill
  "shieldingGcm2": 0,
  "priorityTier": null,
  "wearRatePerYear": 0.05,
  "lifeYears": 10,
  "buildCost": { "imported": [{ "resource": "machine-components", "kg": 6000 }], "local": [] }, // alternative local recipe if printable
  "placement": { "terrain": ["highland", "mare"], "maxSlope": 5, "requiresPSR": false },
  "reactions": [], // reaction ids hosted here
  "techRequired": "surface_power_40kw",
  "encyclopedia": "fsp",
}
```

## Tech

```jsonc
{
  "id": "mre_oxygen",
  "branch": "C",
  "phase": 3,
  "trl2026": 4,
  "costScience": 100,
  "prereqs": ["metal_refining?"], // ? = optional synergy (−20% cost)
  "unlocks": { "buildings": ["mre-plant-s", "mre-plant-l"], "modifiers": [] },
  "setbackRisk": 0.1, // Realistic mode, TRL ≤ 3 only
  "source": "MIT Schreiner sizing studies",
  "as_of": "2026-06",
}
```

## Event

```jsonc
{
  "id": "spe-major",
  "category": "environmental",
  "rates": { "ideal": 0.3, "realistic": 0.5 }, // per year
  "warningTicks": [12, 48],
  "conditions": { "minPhase": 1 },
  "effects": [
    { "type": "radiation-dose", "mSv": [100, 500], "shieldedMSvMax": 10, "shieldGcm2": 10 },
    { "type": "equipment-glitch", "p": 0.2 },
  ],
  "responses": ["shelter-order"],
  "alertTemplate": "Solar particle event inbound (ETA {eta}). Crew outside shelter will exceed dose limits. → Order shelter.",
  "encyclopedia": "spe",
  "source": "NASA dose limit framework",
  "as_of": "2026-06",
}
```

## Scenario

See MODES.md §2.1 (authoritative example). Schema adds `failureOverrides: {eventId: rate}` and `policyWeights`.

## Map

```jsonc
{
  "id": "shackleton_rim",
  "name": "Shackleton Rim",
  "size": [64, 64],
  "tiles": "rle-base64…", // per-tile: {elev, illumClass: A|B|C, icePct, regolith: highland|mare, slope}
  "iceUncertainty": true, // Phase 0 prospecting reveals true icePct
  "lavaTubes": [{ "pos": [12, 40], "capacity": 200 }],
  "source": "LRO-inspired stylization",
  "as_of": "2026-06",
}
```

## Crew (runtime component shapes, for save format)

```jsonc
{
  "id": 1042,
  "name": "…",
  "skills": { "engineer": 3 },
  "health": 92,
  "morale": 71,
  "dose30d": [
    /* 30 daily mSv */
  ],
  "doseCareerMSv": 84,
  "location": 17,
  "task": "maintain:solar-7",
}
```

## Encyclopedia entry

```jsonc
{
  "id": "fsp",
  "title": "Fission Surface Power",
  "body": "NASA's FSP project targets a 40 kWe reactor…",
  "realWorld": "Spec: 40 kWe / 10 yr / ≤6,000 kg; heritage Kilopower/KRUSTY (2018).",
  "sources": ["NASA FSP RFP", "NASA Kilopower"],
  "as_of": "2026-06",
}
```

## Validation rules (CI)

1. Mass balance per reaction (±1e-6).
2. Every building/tech/event id referenced exists.
3. Every `value` with status `sourced` has non-empty `source`.
4. Power priority tiers ∈ {0,1,2,3}; tier 0 reserved for life-support class.
5. No tech cycles; phase of unlocks ≥ phase of tech.
6. Scenario presets load + 100-tick smoke run in CI.
