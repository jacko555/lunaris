import type { World } from "@lunaris/sim-core";

/**
 * Drives the fixed-timestep simulation from the render loop.
 *
 * v0 (M2): the world runs on the main thread behind this class so the UI
 * has a single seam; the TAD §2 Web Worker migration (planned with the M4
 * MVP deploy) replaces the internals without touching callers.
 */
export type SimSpeed = 0 | 1 | 10 | 60 | 720;

export class SimHost {
  world: World;
  speed: SimSpeed = 1;
  /** Alert codes that force speed 0 when they appear (M6 auto-pause). */
  autopauseCodes = new Set<string>();
  /** Set when an autopause fired; the UI clears it after showing why. */
  pausedBy: string | null = null;
  private lastAlertSeq = -1;
  /** Ticks executed per real second at speed 1. */
  private accumulator = 0;
  private lastMs: number | null = null;
  private static readonly MAX_TICKS_PER_FRAME = 120;

  /** Check fresh alerts against the autopause rules (call after pump). */
  checkAutopause(): void {
    const alerts = this.world.store<{ entries: { seq: number; code: string }[] }>("alerts").get(3);
    if (alerts === undefined) {
      return;
    }
    for (const entry of alerts.entries) {
      if (entry.seq > this.lastAlertSeq) {
        this.lastAlertSeq = entry.seq;
        for (const rule of this.autopauseCodes) {
          if (entry.code.startsWith(rule)) {
            this.speed = 0;
            this.pausedBy = entry.code;
          }
        }
      }
    }
  }

  constructor(world: World) {
    this.world = world;
  }

  replaceWorld(world: World): void {
    this.world = world;
    this.accumulator = 0;
    this.lastMs = null;
  }

  /** Advance by wall-clock time; returns how many ticks ran. */
  pump(nowMs: number): number {
    if (this.lastMs === null) {
      this.lastMs = nowMs;
      return 0;
    }
    const dtSeconds = Math.min(0.25, (nowMs - this.lastMs) / 1000);
    this.lastMs = nowMs;
    if (this.speed === 0) {
      this.accumulator = 0;
      return 0;
    }
    this.accumulator += dtSeconds * this.speed;
    let ticks = 0;
    while (this.accumulator >= 1 && ticks < SimHost.MAX_TICKS_PER_FRAME) {
      this.world.tick();
      this.accumulator -= 1;
      ticks++;
    }
    if (ticks >= SimHost.MAX_TICKS_PER_FRAME) {
      this.accumulator = 0; // shed backlog instead of spiraling
    }
    return ticks;
  }
}
