import type { World } from "../ecs/world.js";
import type { EntityId } from "../types.js";
import { ALERTS_COMPONENT, type AlertsComponent } from "./components.js";

/** Alert log is world state (deterministic, hashed); ring-capped. */
export const MAX_ALERTS = 100;

export function pushAlert(
  world: World,
  alertsEntity: EntityId,
  severity: "info" | "warning" | "critical",
  code: string,
  message: string,
): void {
  const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(alertsEntity);
  alerts.entries.push({ tick: world.tickCount, seq: alerts.seq++, severity, code, message });
  if (alerts.entries.length > MAX_ALERTS) {
    alerts.entries.splice(0, alerts.entries.length - MAX_ALERTS);
  }
}
