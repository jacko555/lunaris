/**
 * Well-known resource ids the life-support systems reference. These are
 * id references into the data pack (the values — rates, densities, costs —
 * stay data-driven per CLAUDE.md rule 4); the loader fails fast if a pack
 * omits one that a registered system needs.
 */
export const R_WATER = "water";
export const R_WASTEWATER = "wastewater";
export const R_O2 = "o2-gas";
export const R_CO2 = "co2-gas";
export const R_H2 = "h2-gas";
export const R_CH4 = "ch4-gas";
export const R_FOOD = "food";
export const R_MEDKITS = "medkits";
