// "Remove now, undo for a few seconds" — the delete runs after `delayMs`
// unless undone. Framework-free so it can be unit-tested with fake timers.
//
// Two sets are reported:
//  - pending: inside the undo window (a toast with "Скасувати" is shown)
//  - hidden:  pending + currently committing; the item stays hidden until
//             the delete has finished (or failed, then it comes back).

export type UndoQueueState = { pending: string[]; hidden: string[] };

type Options = {
  delayMs: number;
  onChange: (state: UndoQueueState) => void;
  onFailed?: (key: string, error: unknown) => void;
  // Injected for tests.
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export class UndoableQueue {
  private entries = new Map<string, { handle: unknown; commit: () => Promise<void> }>();
  private committing = new Set<string>();
  private opts: Required<Omit<Options, "onFailed">> & Pick<Options, "onFailed">;

  constructor(opts: Options) {
    this.opts = {
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      ...opts,
    };
  }

  private emit() {
    const pending = [...this.entries.keys()];
    this.opts.onChange({ pending, hidden: [...pending, ...this.committing] });
  }

  has(key: string): boolean {
    return this.entries.has(key) || this.committing.has(key);
  }

  schedule(key: string, commit: () => Promise<void>): boolean {
    if (this.has(key)) return false;
    const handle = this.opts.setTimer(() => void this.run(key), this.opts.delayMs);
    this.entries.set(key, { handle, commit });
    this.emit();
    return true;
  }

  undo(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.opts.clearTimer(entry.handle);
    this.entries.delete(key);
    this.emit();
    return true;
  }

  private async run(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.committing.add(key);
    this.emit();
    try {
      await entry.commit();
    } catch (error) {
      this.opts.onFailed?.(key, error);
    } finally {
      this.committing.delete(key);
      this.emit();
    }
  }

  // Commit everything still in its undo window right now (leaving the page).
  async flush(): Promise<void> {
    const keys = [...this.entries.keys()];
    for (const key of keys) {
      const entry = this.entries.get(key);
      if (entry) this.opts.clearTimer(entry.handle);
    }
    await Promise.all(keys.map((k) => this.run(k)));
  }
}
