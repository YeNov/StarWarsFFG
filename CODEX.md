# Codex II — UI

A bespoke, opt-in reskin of the **Star Wars FFG** sheets for Foundry VTT, built from
the ground up on Foundry's modern application layer. It replaces the look and feel of
the actor and item sheets with a notched "panel" aesthetic, per-actor colour schemes,
and a set of purpose-built widgets — without touching the underlying game logic.

The stock sheets remain available and unchanged; Codex is only active when you choose
a Codex theme.

**Author:** YeNov

---

## Requirements

- **Foundry VTT v13+**.
- **ApplicationV2.** The Codex sheets are native `ApplicationV2` / `DocumentSheetV2`
  documents. They do **not** run on the legacy V1 (`Application`/`FormApplication`)
  sheet path — a V2-capable build of the system is required. On older, V1-only
  installs the Codex themes will not be available; use the stock sheets instead.
- Star Wars FFG system **v2.0.3+**.

## Enabling it

Open **Game Settings → Configure Settings → Star Wars FFG → Default Sheet Theme**
and pick one of:

- `Codex II - Republic`
- `Codex II - Empire`
- `Codex II - Dark`
- `Codex II - Light`
- `Codex II - Mercenary`

Each actor can also override the colour scheme from the sheet's header palette menu.

---

## Scope — what v1 does

**Actor sheets** (character, rival, nemesis, minion, vehicle, adversary)
- Bespoke header, stat blocks, defence/wounds/strain tracks, skill tables, and
  weapon / armour / gear / talent cards.
- Per-actor colour scheme, stored on the actor.
- Collapsible pill stacks for specializations, force powers, and signature abilities.
- Collapsible header (characters / rivals / nemeses / minions): compact avatar, inline
  name, and plain-text credits, remembered per actor.
- XP-buy mode: dropping a specialization / force power / signature ability prompts
  **Buy or Grant**; the per-pill delete control is GM-only and shown only in buy mode.
- Right-click → **Send to chat** on item cards and header pills (force powers also
  offer **Send force roll to chat**).
- Cross-actor item drag-and-drop.

**Item sheets** (weapon, armour, gear, critical injury/damage, ship weapon,
item/ship attachment)
- Bespoke layout with adjusted-value badges (green/red better/worse), range dropdowns,
  firing arcs, hardpoint usage, and inline editing.
- In-place editing of embedded attachments and their modifiers.

**Styling** is hand-maintained in `styles/cdx.css` (everything scoped under `.cdx`).
There is no SCSS build step for Codex.

## Roadmap — what v2 will add

The headline feature for v2 is **interactive progression trees**, rendered in the
Codex visual language:

- **Talent trees** — the specialization talent grid as a navigable, purchasable tree.
- **Force-power trees** — force-power upgrade nodes with prerequisite/linkage rendering.
- **Signature-ability trees** — base ability plus upgrade nodes.

These are intentionally **not** in v1; v1 lists talents / force powers / signature
abilities as cards and pills only.

> **Developers:** the force-power tree is the first of these to land. Its structure —
> the reusable `.cdx-ft-*` design system (tabs, banner, edit mode, cards, buy/learnt,
> connectors, fonts/layout) and how to extend it to the specialization and
> signature-ability trees — is documented in
> [`docs/codex-force-tree-design.md`](docs/codex-force-tree-design.md).

---

## License

The Codex II UI — its original templates, styles, and sheet code, specifically:

- `templates/actors/codex/`
- `templates/parts/codex/`
- `templates/items/codex/`
- `styles/cdx.css`
- `modules/actors/codex-sheets.js`
- `modules/items/codex-item-sheet.js`

— is authored by **YeNov** and released **free of charge**.

You may use, copy, modify, and redistribute it for any **non-commercial** purpose,
provided attribution to the author is retained. **It may not be sold, licensed for a
fee, paywalled, or bundled into any paid product or distribution.**

Formally licensed under **CC BY-NC 4.0** — see [`LICENSE-CODEX`](LICENSE-CODEX) for the
full notice.

The underlying *Star Wars FFG* system, and any pre-existing files this work modifies,
remain under their original **MIT** license — see [`LICENSE.txt`](LICENSE.txt). This
Codex license applies to the original Codex assets and code listed above; it does not
re-license the host system.
