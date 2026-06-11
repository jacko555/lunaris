import type { Scenario } from "../schema/items.js";
import type { JsonObject } from "../types.js";

/**
 * Scenario preset → world config (docs/MODES.md §2.1). The config rides
 * saves verbatim; game-def reads these keys at setup. Policy-weight
 * profiles are overridable per scenario via `policyWeights` (moddable, per
 * the MODES spec); the named profiles are the algorithm's defaults.
 */

export const POLICY_PROFILES: Record<string, Record<string, number>> = {
  cautious: { infrastructure: 2, isru: 1, science: 1, population: 0 },
  balanced: { infrastructure: 1, isru: 1, science: 1, population: 1 },
  aggressive: { infrastructure: 1, isru: 2, science: 1, population: 2 },
  isru_first: { infrastructure: 1, isru: 3, science: 2, population: 0 },
};

export function scenarioToConfig(scenario: Scenario, seedOverride?: number): JsonObject {
  const weights =
    scenario.policyWeights ?? POLICY_PROFILES[scenario.policyAI] ?? POLICY_PROFILES["balanced"];
  const config: JsonObject = {
    scenario: scenario.id,
    agency: scenario.agency,
    startYear: scenario.startYear,
    startPhase: 0,
    failureTables: scenario.failureTables === "realistic" ? "realistic" : "ideal",
    startTechs: [...scenario.startTechs],
    startBudgetUsd: scenario.budgetProfile.annualUSD * 2,
    annualBudgetUsd: scenario.budgetProfile.annualUSD,
    policyEnabled: 1,
    policyWeights: weights as JsonObject,
    autopause: [...scenario.autopause],
    site: scenario.site,
    horizonTicks: Math.round(scenario.horizonYears * 8766),
  };
  if (scenario.rival !== undefined) {
    config["rivalName"] = scenario.rival.name;
    config["rivalMilestones"] = scenario.rival.milestones.map((m) => ({
      tick: Math.max(0, Math.round((m.year - scenario.startYear) * 8766)),
      label: m.label,
    }));
  }
  if (seedOverride !== undefined) {
    config["seedUsed"] = seedOverride;
  }
  return config;
}

/** The scenario's reproducible seed (null in data = caller provides one). */
export function scenarioSeed(scenario: Scenario, fallback: number): number {
  return scenario.seed ?? fallback;
}
