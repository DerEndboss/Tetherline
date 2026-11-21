/**
 * Frame timing for the dev readout and `npm run perf`: how long the simulation and the renderer take per frame
 * (JavaScript time on the main thread) and how often frames come. A ring of the last 240 frames.
 */
export interface PerfSummary {
  fps: number;
  /** Milliseconds per frame: mean and 95th percentile of sim + render JavaScript. */
  frameMs: number;
  frameP95: number;
  simMs: number;
  renderMs: number;
  /** Worst gap between two frames in the window (a hitch), ms. */
  worstGap: number;
}

const SIZE = 240;

export class FramePerf {
  private readonly sim = new Float64Array(SIZE);
  private readonly draw = new Float64Array(SIZE);
  private readonly at = new Float64Array(SIZE);
  private count = 0;

  record(nowMs: number, simMs: number, renderMs: number): void {
    const i = this.count % SIZE;
    this.sim[i] = simMs;
    this.draw[i] = renderMs;
    this.at[i] = nowMs;
    this.count += 1;
  }

  reset(): void {
    this.count = 0;
  }

  summary(): PerfSummary {
    const n = Math.min(this.count, SIZE);
    if (n < 2) return { fps: 0, frameMs: 0, frameP95: 0, simMs: 0, renderMs: 0, worstGap: 0 };
    const idx = Array.from({ length: n }, (_, k) => (this.count - n + k) % SIZE);
    const frames = idx.map((i) => this.sim[i]! + this.draw[i]!).sort((a, b) => a - b);
    const mean = (f: (i: number) => number): number => idx.reduce((s, i) => s + f(i), 0) / n;
    let worst = 0;
    for (let k = 1; k < n; k++) worst = Math.max(worst, this.at[idx[k]!]! - this.at[idx[k - 1]!]!);
    const span = this.at[idx[n - 1]!]! - this.at[idx[0]!]!;
    return {
      fps: span > 0 ? ((n - 1) * 1000) / span : 0,
      frameMs: mean((i) => this.sim[i]! + this.draw[i]!),
      frameP95: frames[Math.floor(n * 0.95)] ?? 0,
      simMs: mean((i) => this.sim[i]!),
      renderMs: mean((i) => this.draw[i]!),
      worstGap: worst,
    };
  }
}
