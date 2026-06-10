# ART-DIRECTION.md — Visual Style

## Direction: "Mission Control Schematic"

Clean vector/iconographic top-down — closer to a NASA ops display than a painterly game. Cheap to produce, reads at any zoom, ages well, and matches the hard-realism brand. (Reference points: Mindustry's clarity, Surviving Mars' icon language, real LRO basemaps.)

## Palette

- Terrain: 4-step grey regolith ramp (#1a1a1e → #6b6b72), mare slightly warm, highlands cool; PSR tiles near-black with blue ice speckle; illumination overlay = warm gold wash.
- Functional colors (colorblind-safe, paired with icons): power amber ◆, water cyan ●, O₂ white ○, food green ✚, heat red ▲, radiation magenta ☢, dust tan ◦, budget green $. Night UI shifts to dim red-on-dark "ops at night" theme.
- Alerts: advisory blue → caution amber → warning orange → critical red (+ klaxon icon).

## Buildings

Flat vector silhouettes with 1px rim light, subtle long shadow that rotates with sun angle (the shadow IS the day/night tell on the map). State badges (⚡ unpowered, ❄ frozen, 🔧 wear) at corner. Construction = blueprint dashed outline filling up.

## Map & motion

Tile grid softened by regolith noise texture; rover/crew dots leave fading track marks (real lunar-dust flavor — tracks persist for game-years). Landings: dust puff radial particles (suppressed on pads). SPE: full-screen subtle magenta vignette + particle streaks.

## Typography

UI: Inter or IBM Plex Sans; data/mono: IBM Plex Mono (telemetry vibe). Title: extended geometric (e.g., 'Michroma'-class) used sparingly.

## Audio (later)

Quiet synth ambience; Geiger-tick during SPE; comms-static blips for events; no music walls — Antarctic-station quiet.

## Godot 3D upgrade path (Stage 4)

Keep schematic language: low-poly buildings, flat materials + emissive accents, orthographic-ish camera; terrain from real LRO south-pole DEM. Vector icon set carries over 1:1.

## Asset licensing

All original art in /assets under the asset license (separate from MIT code). No copyrighted agency logos; agencies appear by name/text flavor only. NASA imagery: public domain usable for reference/encyclopedia with credit lines.
