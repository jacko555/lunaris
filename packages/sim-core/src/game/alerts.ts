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
  causedBy?: number,
): number {
  const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(alertsEntity);
  const seq = alerts.seq++;
  const entry: import("./components.js").AlertEntry = {
    tick: world.tickCount,
    seq,
    severity,
    code,
    message,
  };
  if (causedBy !== undefined) {
    entry.causedBy = causedBy; // omitted when absent so old saves hash identically
  }
  alerts.entries.push(entry);
  if (alerts.entries.length > MAX_ALERTS) {
    alerts.entries.splice(0, alerts.entries.length - MAX_ALERTS);
  }
  return seq;
}
