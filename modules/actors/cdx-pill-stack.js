/**
 * CODEX II — collapsible "pill stack" interaction (reusable).
 *
 * A pill stack (specializations, force powers, signature abilities, …) shows its
 * members as a vertical stack of notched pills (styling lives in cdx.css under
 * `.cdx-stack`). This class owns the INTERACTION. Every click it handles is
 * CONSUMED in the capture phase (preventDefault + stopPropagation), so it can
 * never leak through to the stock sheet handlers or the canvas underneath — the
 * pills carry `.item` / `.item-delete`, which the base sheet also listens for, and
 * an open stack overlaps the sheet body, so swallowing the click is essential.
 *
 *   collapsed + click anywhere on the stack    → expand it
 *   expanded  + click a pill                   → onActivate(itemId)  (open its tree)
 *   expanded  + click a pill's `.item-delete`  → onDelete(itemId)
 *   expanded  + click anywhere else             → just collapse
 *
 * One instance wires every `.cdx-stack.cdx-collapsible` under a root element. It
 * keeps a single document-level capture listener alive for the root's lifetime;
 * that listener is a no-op while nothing is open (so ordinary clicks pass
 * straight through) and only engages — consuming the click — once a stack is
 * open. Call {@link CdxPillStack#destroy} on sheet re-render and close so the
 * document listener never outlives its DOM.
 *
 * The class is deliberately document-agnostic: it resolves a pill to an id via
 * `data-item-id` and hands that id to the caller's `onActivate` / `onDelete`, so
 * the same widget drives specs, force powers, signature abilities — anything
 * rendered as a `.cdx-stack.cdx-collapsible` of `.cdx-pill[data-item-id]`.
 */
export class CdxPillStack {
  /**
   * @param {HTMLElement} root  container scanned for `.cdx-stack.cdx-collapsible`
   * @param {object} [opts]
   * @param {(id: string) => void} [opts.onActivate]  open a pill item's window
   * @param {(id: string) => void} [opts.onDelete]    remove a pill item
   */
  constructor(root, { onActivate, onDelete } = {}) {
    this.root = root;
    this.onActivate = onActivate;
    this.onDelete = onDelete;
    this._onExpand = this._onExpand.bind(this);
    this._onDocClick = this._onDocClick.bind(this);

    this._stacks = root ? [...root.querySelectorAll(".cdx-stack.cdx-collapsible")] : [];
    // Capture on each stack: turns the collapsed→expanded transition before the
    // pill's own `.item` open handler (bubble phase) can fire.
    for (const s of this._stacks) s.addEventListener("click", this._onExpand, true);
    // One capture listener for the whole document. Cheap to leave attached: it
    // returns immediately unless one of our stacks is open.
    document.addEventListener("click", this._onDocClick, true);
  }

  /** Detach every listener. Safe to call repeatedly. */
  destroy() {
    for (const s of this._stacks) s.removeEventListener("click", this._onExpand, true);
    document.removeEventListener("click", this._onDocClick, true);
    this._stacks = [];
  }

  /** The currently-open stack, if any. */
  _openStack() {
    return this._stacks.find((s) => s.classList.contains("open")) ?? null;
  }

  _consume(ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }

  /**
   * Collapsed → expand. Only reached while collapsed: once a stack is open the
   * document listener fires first (capture, higher in the tree) and consumes the
   * click, so this never runs for an open stack.
   */
  _onExpand(ev) {
    const stack = ev.currentTarget;
    if (stack.classList.contains("open")) return;
    this._consume(ev);
    // One open at a time — collapse any sibling stack first.
    const other = this._openStack();
    if (other && other !== stack) other.classList.remove("open");
    stack.classList.add("open");
  }

  /**
   * While a stack is open, the next click ANYWHERE is ours: consume it and route
   * it. A click on a pill activates (or deletes) that item; a click anywhere else
   * (including elsewhere on the sheet, or outside it) simply collapses. Either
   * way the click is swallowed so it does not also trigger whatever it landed on.
   */
  _onDocClick(ev) {
    const stack = this._openStack();
    if (!stack) return; // nothing open → let the click through untouched
    this._consume(ev);
    const pill = stack.contains(ev.target) ? ev.target.closest(".cdx-pill") : null;
    if (pill) {
      const id = pill.dataset.itemId;
      if (id) {
        if (ev.target.closest(".item-delete")) this.onDelete?.(id);
        else this.onActivate?.(id);
      }
    }
    stack.classList.remove("open");
  }
}
