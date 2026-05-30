# V2 Port Sheet Comparison Against Main

Date: 2026-05-30
URL: `http://192.168.1.7:30000/`
Automated login: `Andre`

## Capture Scope

The comparison was captured from the same Foundry URL on both branches:

- `V2-port`
- `main`

The following planned documents were not owned by `Andre`, so the harness used owned fallbacks where possible:

| Target | Planned document | Result |
| --- | --- | --- |
| Character | `Jovel Nial` | Fallback to owned character `Орііз Катард` |
| Minion | `Akk Dog` | Not captured: no owned minion fallback was available |
| Vehicle | `All Terrain Light Scout Transport` | Fallback to owned vehicle `SCS-17a "Sentinel" Armored Landspeeder (гравців)` |
| Weapon | `KD-30F "Dissuader-FETT" Pistol` | Fallback to owned embedded weapon `Vibro-ax` |
| Talent | first owned embedded talent | Captured `Quick Draw (from armor attachment)` |

The user-visible token minion sheet still needs a GM-owned or otherwise accessible capture to compare precisely.

## Screenshot Records

Captured artifacts are under `tmp/sheet-compare/`:

| Sheet | Main screenshot | V2-port screenshot |
| --- | --- | --- |
| Character | `tmp/sheet-compare/main/character.png` | `tmp/sheet-compare/v2/character.png` |
| Vehicle | `tmp/sheet-compare/main/vehicle.png` | `tmp/sheet-compare/v2/vehicle.png` |
| Weapon | `tmp/sheet-compare/main/weapon.png` | `tmp/sheet-compare/v2/weapon.png` |
| Talent | `tmp/sheet-compare/main/talent.png` | `tmp/sheet-compare/v2/talent.png` |

Raw DOM and layout metrics:

- `tmp/sheet-compare/main/summary.json`
- `tmp/sheet-compare/v2/summary.json`

## Findings

### 1. Right-side sheet tabs are clipped in `V2-port`

This is the largest layout regression visible in every captured sheet.

On `main`, the vertical tab bar shows full tabs with icons. On `V2-port`, only a narrow colored strip is visible at the right edge; the icons are clipped away.

Measured tab positions:

| Sheet | Main first tab Y | V2-port first tab Y | Difference |
| --- | ---: | ---: | ---: |
| Character | 116 | 146 | +30 px |
| Vehicle | 132 | 162 | +30 px |
| Weapon | 116 | 146 | +30 px |
| Talent | 116 | 146 | +30 px |

Likely cause from captured DOM:

- `main` content root: `SECTION.window-content`
- `V2-port` content root: `FORM.window-content.editable...`
- `V2-port` content has `overflow: hidden`

The tabs appear to be inside or affected by the form/window-content clipping context after the V2 compatibility migration.

### 2. Header controls differ from `main`

`main` shows the older visible header actions such as `Sheet`, `Prototype Token`, and `Close`, plus `Sheet Options` near the title area.

`V2-port` shows compact V2-style icon controls only. The title text is cleaner on `V2-port`, but the visible control layout no longer matches `main`.

Examples from capture metrics:

| Sheet | Main header title | V2-port header title |
| --- | --- | --- |
| Character | `Орііз КатардSheet Options` | `Орііз Катард` |
| Vehicle | `SCS-17a ... Sheet Options` | `SCS-17a ...` |
| Weapon | `Vibro-axSheet Options` | `Vibro-ax` |

### 3. Unchecked checkbox styling differs

On `main`, unchecked checkboxes render as light/empty boxes.

On `V2-port`, unchecked boxes render as dark filled squares in the character skills list and talent attributes. This is visible on:

- Character skill career/spec checkboxes
- Talent `Ranked?`, `Force Talent?`, and `Conflict?`

This may be another side effect of the changed form/content root classes.

### 4. Character sheet body is slightly shorter in `V2-port`

The character sheet outer window size is identical in both captures, but the scrollable body and skill table area are shorter in `V2-port`.

| Metric | Main | V2-port | Difference |
| --- | ---: | ---: | ---: |
| Character outer window | 630 x 783 | 630 x 783 | Same |
| Character sheet body height | 493 | 470 | -23 px |
| Character skills panel height | 380 | 357 | -23 px |

The visual result is that slightly less of the skill list is visible before scrolling.

### 5. Item sheets open on different active tabs

The embedded weapon and talent sheets do not open to the same active tab.

| Sheet | Main active tab | V2-port active tab |
| --- | --- | --- |
| Weapon | `attributes` | `description` |
| Talent | `attributes` | `description` |

This produces large visible differences below the shared header/stat sections:

- `main` shows attribute controls, qualities/modifiers, associated skills, and modifier grids.
- `V2-port` shows description/source text instead.

This may be intentional if tab persistence/default behavior changed, but it is not visually equivalent to `main`.

### 6. Root classes differ substantially

Captured root classes:

| Sheet type | Main | V2-port |
| --- | --- | --- |
| Actor | `app window-app starwarsffg sheet actor v2 themed theme-light` | `application sheet app window-app starwarsffg actor v2` |
| Item | `app window-app starwarsffg sheet item v2 themed theme-light` | `application sheet app window-app starwarsffg item v2` |

The V2-port root includes the restored legacy-style classes, but drops `themed theme-light` and places `sheet` earlier in the class list. The visual impact is mainly seen through clipping/header/control differences rather than the class list by itself.

## Pixel Difference Samples

These are rough sampled diffs, checking every second pixel and counting RGB delta greater than 30.

| Sheet | Screenshot size | Sampled diff |
| --- | --- | ---: |
| Character | 750 x 863 | 11.55% |
| Vehicle | 720 x 904 | 7.37% |
| Weapon | 670 x 830 | 18.80% |
| Talent | 525 x 615 | 20.46% |

The weapon/talent diff is inflated by the active-tab mismatch. The character/vehicle diff mostly reflects header controls and clipped side tabs.

## Recommended Fix Order

1. Fix vertical tab clipping first. The body content is mostly aligned, but the tabs are visibly broken.
2. Decide whether `V2-port` should intentionally keep V2 icon header controls or restore the visible `main` header action layout.
3. Restore checkbox visual parity for unchecked boxes.
4. Decide whether item sheets should preserve the `main` active-tab behavior or whether `description` is now the intended default.
5. Re-run comparison with a GM-accessible minion/token sheet, especially `Scout Trooper Recon Team`, because the automated `Andre` login could not capture that sheet.
