/**
 * Seeded deterministic PRNG — mulberry32 (per docs/TAD.md §4 determinism contract).
 *
 * Exactly one Rng instance is owned by the World; systems draw from it in fixed
 * registry order so identical (seed, config, input log) always replays identically.
 * `Math.random` is lint-banned repo-wide; nothing else may generate randomness
 * that affects simulation state.
 *
 * State is a single uint32, serialized into saves so a loaded world continues
 * the same stream it would have produced uninterrupted.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Coerce to uint32 so any numeric seed maps onto the same well-defined stream
    // on every platform.
    this.state = seed >>> 0;
  }

  /** Resume a stream from a serialized state (save/load). */
  static fromState(state: number): Rng {
    return new Rng(state);
  }

  /** Serializable stream state for saves. */
  getState(): number {
    return this.state;
  }

  /** Next float in [0, 1) with 32 bits of entropy. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer drawn uniformly from [min, max] inclusive. */
  nextInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`nextInt requires integers with min <= max, got [${min}, ${max}]`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p (clamped to [0, 1]). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Uniform pick from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError("pick requires a non-empty array");
    }
    return items[this.nextInt(0, items.length - 1)] as T;
  }
}
