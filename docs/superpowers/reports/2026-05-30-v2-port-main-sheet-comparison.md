# V2 Port Sheet Comparison Against Main

Date: 2026-05-30
URL: `http://192.168.1.7:30000/`

## Capture Scope

Two comparison passes were captured from the same Foundry URL on both `main` and `V2-port`.

The first pass used `Andre`. That was enough for owned character, vehicle, weapon, and talent fallbacks, but not enough for GM-only actor/token fixtures.

The second pass used `Gamemaster` with no password. This is the primary comparison pass because it captured the planned documents directly, including the token-style `Scout Trooper Recon Team` minion sheet from the active scene.

## Screenshot Records

GM capture artifacts:

| Sheet | Main screenshot | V2-port screenshot |
| --- | --- | --- |
| Character: `Jovel Nial` | `tmp/sheet-compare/main-gm/character.png` | `tmp/sheet-compare/v2-gm/character.png` |
| Minion: `Akk Dog` | `tmp/sheet-compare/main-gm/minion.png` | `tmp/sheet-compare/v2-gm/minion.png` |
| Token minion: `[Token] Scout Trooper Recon Team` | `tmp/sheet-compare/main-gm/scout-token-minion.png` | `tmp/sheet-compare/v2-gm/scout-token-minion.png` |
| Vehicle: `All Terrain Light Scout Transport` | `tmp/sheet-compare/main-gm/vehicle.png` | `tmp/sheet-compare/v2-gm/vehicle.png` |
| Weapon: `KD-30F "Dissuader-FETT" Pistol` | `tmp/sheet-compare/main-gm/weapon.png` | `tmp/sheet-compare/v2-gm/weapon.png` |
| Talent: `Dark Side Paragon` | `tmp/sheet-compare/main-gm/talent.png` | `tmp/sheet-compare/v2-gm/talent.png` |

GM raw DOM and layout metrics:

- `tmp/sheet-compare/main-gm/summary.json`
- `tmp/sheet-compare/v2-gm/summary.json`

Earlier `Andre` fallback artifacts are still under `tmp/sheet-compare/main/` and `tmp/sheet-compare/v2/`.

## Findings

### 1. Minion and token minion sheets have a major V2-only header action leak

This is the most precise match for the broken example.

On `main`, the `KILL` stat card contains only the expected minion/group skull controls. On `V2-port`, the card includes extra header action text and icons:

- `Sheet`
- `Options`
- extra skull icon line

Measured on `[Token] Scout Trooper Recon Team`:

| Metric | Main | V2-port | Difference |
| --- | ---: | ---: | ---: |
| Sheet header height | 237.31 px | 293.31 px | +56.00 px |
| Sheet body Y | 351.31 px | 407.31 px | +56.00 px |
| Skills table Y | 451.31 px | 507.31 px | +56.00 px |
| Skills table height | 241.00 px | 199.69 px | -41.31 px |

The same shift occurs on the `Akk Dog` minion sheet. This means the visible body is pushed down and the skill tables lose space.

Likely root cause: the V2 compatibility header action projection is entering the sheet body content, or an old header action selector is no longer scoped to the window header.

### 2. Right-side sheet tabs are clipped in `V2-port`

On `main`, the vertical tab bar shows full tabs with icons. On `V2-port`, only narrow colored strips are visible at the right edge; the icons are clipped away.

Measured first-tab positions in the GM pass:

| Sheet | Main first tab Y | V2-port first tab Y | Difference |
| --- | ---: | ---: | ---: |
| Character | 116 | 146 | +30 px |
| Minion | 116 | 146 | +30 px |
| Token minion | 116 | 146 | +30 px |
| Vehicle | 132 | 162 | +30 px |
| Weapon | 116 | 146 | +30 px |
| Talent | 116 | 146 | +30 px |

Likely cause from captured DOM:

- `main` content root: `SECTION.window-content`
- `V2-port` content root: `FORM.window-content.editable...`
- `V2-port` content has `overflow: hidden`

The tabs appear to be inside or affected by the form/window-content clipping context after the V2 compatibility migration.

### 3. Header controls differ from `main`

`main` shows the older visible header actions such as `Sheet`, `Prototype Token` or `Token`, and `Close`, plus `Sheet Options` near the title area.

`V2-port` shows compact V2-style icon controls only. The title text is cleaner on `V2-port`, but the visible control layout no longer matches `main`.

Examples from GM capture metrics:

| Sheet | Main header title | V2-port header title |
| --- | --- | --- |
| Character | `Jovel NialSheet Options` | `Jovel Nial` |
| Token minion | `[Token] Scout Trooper Recon TeamSheet Options` | `[Token] Scout Trooper Recon Team` |
| Vehicle | `All Terrain Light Scout TransportSheet Options` | `All Terrain Light Scout Transport` |
| Weapon | `KD-30F "Dissuader-FETT" PistolSheet Options` | `KD-30F "Dissuader-FETT" Pistol` |

This is partly expected from V2 window chrome, but it is also connected to the minion `Sheet Options` leakage described above.

### 4. Unchecked checkbox styling differs

On `main`, unchecked checkboxes render as light/empty boxes.

On `V2-port`, unchecked boxes render as dark filled squares. This is visible on:

- Character and minion skill career/spec checkboxes
- Talent `Ranked?`, `Force Talent?`, and `Conflict?`

This may be another side effect of the changed form/content root classes.

### 5. Character sheet body is slightly shorter in `V2-port`

The character sheet outer window size is identical in both captures, but the scrollable body and skill table area are shorter in `V2-port`.

| Metric | Main | V2-port | Difference |
| --- | ---: | ---: | ---: |
| Character outer window | 630 x 783 | 630 x 783 | Same |
| Character sheet body height | 493 | 470 | -23 px |
| Character skills panel height | 380 | 357 | -23 px |

The visual result is that slightly less of the skill list is visible before scrolling.

### 6. Item sheets open on different active tabs

The item sheets do not open to the same active tab.

| Sheet | Main active tab | V2-port active tab |
| --- | --- | --- |
| Weapon | `attributes` | `description` |
| Talent | `attributes` | `description` |

This produces large visible differences below the shared header/stat sections:

- `main` shows attribute controls, qualities/modifiers, associated skills, and modifier grids.
- `V2-port` shows description/source text instead.

This may be intentional if tab persistence/default behavior changed, but it is not visually equivalent to `main`.

### 7. Root classes differ substantially

Captured root classes:

| Sheet type | Main | V2-port |
| --- | --- | --- |
| Actor | `app window-app starwarsffg sheet actor v2 themed theme-light` | `application sheet app window-app starwarsffg actor v2` |
| Item | `app window-app starwarsffg sheet item v2 themed theme-light` | `application sheet app window-app starwarsffg item v2` |

The V2-port root includes restored legacy-style classes, but drops `themed theme-light` and uses a V2 `FORM.window-content.editable...` root inside the sheet.

## Pixel Difference Samples

These are rough sampled diffs from the GM pass, checking every second pixel and counting RGB delta greater than 30.

| Sheet | Screenshot size | Sampled diff |
| --- | --- | ---: |
| Character | 750 x 863 | 13.02% |
| Minion | 720 x 724 | 37.03% |
| Token minion | 720 x 724 | 37.15% |
| Vehicle | 720 x 904 | 8.95% |
| Weapon | 670 x 830 | 15.09% |
| Talent | 525 x 615 | 22.70% |

The minion/token-minion diffs are high because the V2-only `Sheet Options` leak changes the sheet header height and shifts the body down.

## Recommended Fix Order

1. Fix the minion/token-minion `Sheet Options` leakage into the `KILL` stat card.
2. Fix vertical tab clipping.
3. Restore checkbox visual parity for unchecked boxes.
4. Decide whether `V2-port` should intentionally keep V2 icon header controls or restore the visible `main` header action layout.
5. Decide whether item sheets should preserve the `main` active-tab behavior or whether `description` is now the intended default.
