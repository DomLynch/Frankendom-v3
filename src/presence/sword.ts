// Remote players' sword, whenever the hero's painted shape lands. The hero's shape file resolves on its own clock (after the rigs, and again at a rank change), so a remote body spawned
// earlier must be given it later. One latest shape, a small list of the pooled bodies (they live as long as the page and are recycled, never disposed), and an apply that touches a body
// only when it does not already wear that shape: no per-frame work, no fetch, no stacking (the body's own reshape replaces what it hung before). Pure: no THREE import; the caller passes the
// body's reshape. Called from the marked spawnRemote() block in src/fight/scene.ts.
interface SwordBody<M> { reshape(mesh: M | undefined): void }
interface Entry<M> { body: SwordBody<M>; wears: M | undefined; set: boolean }
export class RemoteSwords<M> {
  private latest: M | undefined;
  private known = false;   // a shape decision has arrived (a mesh, or "none"): before that a new body keeps the rig's own part
  private readonly bodies: Entry<M>[] = [];
  /** A new pooled body: it takes the current shape at once if one has been decided. */
  add(body: SwordBody<M>): void { const entry: Entry<M> = { body, wears: undefined, set: false }; this.bodies.push(entry); if (this.known) this.apply(entry); }
  /** The hero's shape resolved (or changed with his rank, or is none): every body not already wearing it takes it. Returns how many were changed. */
  set(mesh: M | undefined): number {
    this.latest = mesh; this.known = true;
    let changed = 0; for (const entry of this.bodies) if (this.apply(entry)) changed++;
    return changed;
  }
  private apply(entry: Entry<M>): boolean {
    if (entry.set && entry.wears === this.latest) return false;
    entry.body.reshape(this.latest); entry.wears = this.latest; entry.set = true; return true;
  }
  get size(): number { return this.bodies.length; }
}
