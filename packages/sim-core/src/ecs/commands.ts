import { stableStringify } from "../stable-stringify.js";
import type { JsonValue } from "../types.js";

/**
 * All external input — player or Policy AI — enters the simulation as
 * serializable commands (CLAUDE.md hard rule 2). Commands execute at the
 * start of their target tick, ordered by (tick, seq); seq is a monotonic
 * counter assigned at enqueue time, so identical enqueue sequences replay
 * identically.
 */
export interface QueuedCommand {
  tick: number;
  seq: number;
  type: string;
  payload: JsonValue;
}

export interface CommandQueueState {
  pending: QueuedCommand[];
  log: QueuedCommand[];
  nextSeq: number;
}

export class CommandQueue {
  private pending: QueuedCommand[] = [];
  private log: QueuedCommand[] = [];
  private nextSeq = 0;

  enqueue(type: string, payload: JsonValue, tick: number): QueuedCommand {
    // Serializability guard: a payload that cannot canonically stringify
    // (NaN, undefined, Map, class instance) is rejected at the boundary.
    stableStringify(payload);
    const cmd: QueuedCommand = { tick, seq: this.nextSeq++, type, payload };
    this.pending.push(cmd);
    this.log.push(cmd);
    return cmd;
  }

  /** Remove and return all commands due at or before `tick`, in (tick, seq) order. */
  takeDue(tick: number): QueuedCommand[] {
    const due: QueuedCommand[] = [];
    const rest: QueuedCommand[] = [];
    for (const cmd of this.pending) {
      (cmd.tick <= tick ? due : rest).push(cmd);
    }
    this.pending = rest;
    due.sort((a, b) => (a.tick !== b.tick ? a.tick - b.tick : a.seq - b.seq));
    return due;
  }

  /** Full input log since world creation (for replay). */
  getLog(): readonly QueuedCommand[] {
    return this.log;
  }

  pendingCount(): number {
    return this.pending.length;
  }

  serialize(includeLog: boolean): CommandQueueState {
    return {
      pending: [...this.pending],
      log: includeLog ? [...this.log] : [],
      nextSeq: this.nextSeq,
    };
  }

  restore(state: CommandQueueState): void {
    this.pending = [...state.pending];
    this.log = [...state.log];
    this.nextSeq = state.nextSeq;
  }
}
