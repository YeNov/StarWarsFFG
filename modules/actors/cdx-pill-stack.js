/**
 * CODEX II — collapsible "pill stack" interaction (reusable).
 *
 * A pill stack (specializations, force powers, signature abilities, …) shows its
 * members as a vertical stack of notched pills (styling lives in cdx.css under
 * `.cdx-stack`). This class owns the INTERACTION:
 *
 *   collapsed + click anywhere on the stack    → expand it
 *   expanded  + click a pill                   → onActivate(id): open its tree
 *                                                (the stack STAYS open)
 *   expanded  + click a pill's `.item-delete`  → onDelete(id), then collapse
 *   expanded  + click elsewhere on the sheet    → collapse
 *
 * Scope — the single capture listener lives on the sheet ROOT, not the document.
 * That has two important consequences:
 *  - Every click it handles is consumed (preventDefault + stopPropagation) in the
 *    capture phase, so it never leaks to the stock `.item` / `.item-delete`
 *    handlers the pills also carry, nor to the sheet content an open stack
 *    overlaps.
 *  - It never sees clicks in OTHER windows (e.g. the tree we just opened) or on
 *    the canvas, so those cannot collapse the stack. The collapse-on-click-
 *    elsewhere therefore only fires while the user is interacting with this
 *    sheet — opening and browsing a tree leaves the stack open.
 *
 * The listener is bound per render and dies with its root; {@link #destroy} (on
 * re-render and close) detaches it belt-and-suspenders.
 *
 * The class is document-agnostic — it resolves a pill via `data-item-id` and
 * hands the id to the caller's `onActivate` / `onDelete` — so the same widget
 * drives specs, force powers, signature abilities: anything rendered as a
 * `.cdx-stack.cdx-collapsible` of `.cdx-pill[data-item-id]`.
 */
export class CdxPillStack {
  /**
   * @param {HTMLElement} root  the sheet root scanned for `.cdx-stack.cdx-collapsible`
   * @param {object} [opts]
   * @param {(id: string) => void} [opts.onActivate]  open a pill item's window
   * @param {(id: string) => void} [opts.onDelete]    remove a pill item
   */
  constructor(root, { onActivate, onDelete } = {}) {
    this.root = root;
    this.onActivate = onActivate;
    this.onDelete = onDelete;
    this._onClick = this._onClick.bind(this);

    this._stacks = root ? [...root.querySelectorAll(".cdx-stack.cdx-collapsible")] : [];
    // One capture listener on the sheet root. Capture so it runs before the
    // pills' own bubble-phase handlers; rooted on the sheet so clicks in other
    // windows never reach it (and so can't collapse us).
    if (root) root.addEventListener("click", this._onClick, true);
  }

  /** Detach the listener. Safe to call repeatedly. */
  destroy() {
    if (this.root) this.root.removeEventListener("click", this._onClick, true);
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

  _onClick(ev) {
    const open = this._openStack();
    if (open) {
      // A stack is open: this click is ours to handle and swallow.
      this._consume(ev);
      const pill = open.contains(ev.target) ? ev.target.closest(".cdx-pill") : null;
      const id = pill?.dataset.itemId;
      if (id && ev.target.closest(".item-delete")) {
        this.onDelete?.(id); // delete → fall through and collapse
      } else if (id) {
        this.onActivate?.(id); // open the tree and LEAVE the stack open
        return;
      }
      open.classList.remove("open"); // delete, or a click elsewhere on the sheet
      return;
    }
    // Nothing open: expand if the click landed on one of our collapsed stacks.
    const stack = ev.target.closest?.(".cdx-stack.cdx-collapsible");
    if (stack && this._stacks.includes(stack)) {
      this._consume(ev);
      stack.classList.add("open");
    }
  }
}
