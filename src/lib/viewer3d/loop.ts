// Render on demand (M16.1): nothing is drawn until something asks. invalidate() schedules one frame; many calls before it
// fires still draw once. An animation or a coasting camera returns `true` from the frame callback to ask for the next one,
// and the loop stops the moment nothing needs it, so an idle stage costs zero frames. Pure: the scheduler is injected.
export interface Scheduler {
  request(cb: (t: number) => void): number;
  cancel(id: number): void;
}

export class RenderLoop {
  private id = 0;
  private last = 0;
  private paused = false;
  /** Frames drawn since construction (tests and the perf readout). */
  frames = 0;

  constructor(
    private readonly scheduler: Scheduler,
    /** Draw one frame; `dt` in seconds since the previous frame of a run (0 for the first). Return true to keep going. */
    private readonly frame: (dt: number) => boolean,
  ) {}

  get pending(): boolean {
    return this.id !== 0;
  }

  invalidate(): void {
    if (this.paused || this.id) return;
    this.id = this.scheduler.request((t) => this.tick(t));
  }

  /** Hidden tab or stage off screen: drop the pending frame. resume() draws once to catch up. */
  pause(): void {
    this.paused = true;
    if (this.id) this.scheduler.cancel(this.id);
    this.id = 0;
    this.last = 0;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.invalidate();
  }

  dispose(): void {
    this.pause();
  }

  private tick(t: number): void {
    this.id = 0;
    const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0;
    this.frames++;
    const more = this.frame(dt);
    if (more && !this.paused) {
      this.last = t;
      this.invalidate();
    } else this.last = 0;
  }
}
