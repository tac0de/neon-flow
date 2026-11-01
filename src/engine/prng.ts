/**
 * Deterministic Mulberry32 PRNG for reproducible traffic simulation and optimization.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = (Math.floor(seed) | 0) || 1;
  }

  /**
   * Returns a deterministic pseudo-random float in [0, 1)
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns an integer in [min, max] inclusive
   */
  public nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  public getState(): number {
    return this.state;
  }

  public setState(state: number): void {
    this.state = state | 0;
  }
}
