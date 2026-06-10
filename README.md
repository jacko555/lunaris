# LUNARIS 🌗

### A hard-realism simulation & game of humanity's colonization of the Moon

**Play in your browser, free: https://jacko555.github.io/lunaris/ — v1.0 is out: both modes, all six eras, the full tech tree, and a policy AI you can take command from at any tick.**

LUNARIS models lunar settlement the way it could actually happen — real physics (1/6 g, the 29.5-day lunar day, real radiation doses), real chemistry (molten regolith electrolysis, ice-to-propellant, Sabatier loops), and the real 2026 space program (Artemis Moon Base, CLPS landers, Starship, Blue Moon, China's ILRS).

## Two ways to play

- **🛰 Simulation Mode** — configure a scenario (agency, budget, "ideal" vs "realistic" failure rates) and watch colonization unfold from robotic precursors to a lunar city. Intervene anytime.
- **🏗 Game Mode** — take command yourself: land hardware, balance power and life support through the 14-day lunar night, build ISRU production chains, survive solar storms, and lead the colony through six eras to self-sufficiency and beyond.

## The eras

Robotic Precursors → Crewed Sorties → Outpost → Permanent Base + ISRU → Self-Sustaining Settlement → Industrial Export → Lunar City

## Why it's different

- Every constant is sourced (and shown in-game in the **Lunarpedia**): 0.84 kg of O₂ per person per day, 40 kWe fission units, 5.6 wt% ice at the LCROSS site, ~33 kWh per kg of MRE oxygen.
- Deterministic simulation core — every run is reproducible and shareable by seed.
- Fully data-driven and moddable: all buildings, reactions, tech, and events are JSON.

## Quick start (dev)

```bash
pnpm install
pnpm dev        # web client at localhost:5173
pnpm test       # sim-core unit + determinism tests
```

## Project status

v0.1 in development — see [ROADMAP](docs/ROADMAP.md) and [TASKS](TASKS.md). Built with the help of Claude Code; see [CLAUDE.md](CLAUDE.md) for repo conventions.

## Docs

[PRD](PRD.md) · [Game Design](docs/GDD.md) · [Simulation Design](docs/SDD.md) · [Architecture](docs/TAD.md) · [Phases](docs/PHASES.md) · [Economy](docs/ECONOMY.md) · [Buildings](docs/BUILDINGS.md) · [Tech Tree](docs/TECH-TREE.md) · [Events](docs/EVENTS.md) · [Modes](docs/MODES.md) · [Data Schemas](docs/DATA-SCHEMA.md)

## License

Code: MIT. Art & audio assets: separate license (see assets/LICENSE). Contributions require signing the CLA — see [CONTRIBUTING](CONTRIBUTING.md).
