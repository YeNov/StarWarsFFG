# Using SVG For Diamond Chips In Actor Sheet Layouts

SVG is a strong fit for polygonal chips, diamond blocks, and custom outlines in a Foundry actor sheet. The main reason is that SVG lets the visual shape and the outline share the same geometry. CSS `clip-path` can cut a diamond-shaped fill, but a normal CSS `border` will not naturally follow that clipped polygon.

The best pattern is to use SVG for the decorative shape and keep the actual sheet controls, labels, and form behavior in normal HTML.

## Basic Diamond Shape

A simple diamond can be drawn with a `polygon` for the fill and a `path` for the outline.

```html
<svg class="chip" viewBox="0 0 100 100" role="img">
  <polygon
    class="chip-fill"
    points="50 4 96 50 50 96 4 50"
  />

  <path
    class="chip-outline"
    d="M50 4 L96 50 L50 96 L4 50 Z"
  />
</svg>
```

```css
.chip {
  width: 40px;
  height: 40px;
  display: block;
}

.chip-fill {
  fill: var(--chip-fill, #222);
}

.chip-outline {
  fill: none;
  stroke: var(--chip-outline, #f4c542);
  stroke-width: 5;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
```

The important part is that the fill and outline use the same diamond geometry. The `polygon` paints the body, while the `path` draws the visible outline.

## More Blocky Polygonal Diamond

For a more mechanical or block-like diamond, add extra corners:

```html
<svg class="chip" viewBox="0 0 100 100" aria-hidden="true">
  <polygon
    class="chip-fill"
    points="50 2 88 20 98 50 88 80 50 98 12 80 2 50 12 20"
  />
  <path
    class="chip-outline"
    d="M50 2 L88 20 L98 50 L88 80 L50 98 L12 80 L2 50 L12 20 Z"
  />
</svg>
```

This gives the chip a beveled, token-like shape instead of a pure four-point diamond.

## Recommended Actor Sheet Pattern

In an actor sheet, avoid making the SVG itself responsible for button behavior or text layout. Use a normal button, input, or wrapper element, then place the SVG behind the label.

```html
<button class="diamond-chip" type="button">
  <svg class="diamond-chip__shape" viewBox="0 0 100 100" aria-hidden="true">
    <polygon points="50 4 96 50 50 96 4 50" />
    <path d="M50 4 L96 50 L50 96 L4 50 Z" />
  </svg>
  <span class="diamond-chip__label">3</span>
</button>
```

```css
.diamond-chip {
  position: relative;
  inline-size: 2.5rem;
  block-size: 2.5rem;
  display: grid;
  place-items: center;
  border: 0;
  background: none;
  color: white;
}

.diamond-chip__shape {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.diamond-chip__shape polygon {
  fill: var(--chip-bg, #1d2430);
}

.diamond-chip__shape path {
  fill: none;
  stroke: var(--chip-border, #d6a84f);
  stroke-width: 4;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.diamond-chip__label {
  position: relative;
  z-index: 1;
  font-weight: 700;
}
```

This keeps the sheet interaction model clean. The button is still a button, the label is still normal HTML text, and the SVG is just the shaped visual layer.

## Downsides To Watch

- **More markup per chip**: inline SVG adds nodes. A handful is fine; hundreds of repeated SVG chips in a large sheet can make the DOM noisier.
- **CSS and theming are a bit fussier**: styling `polygon`, `path`, `stroke`, `fill`, hover, active, disabled, and dark/light theme states is more verbose than styling a `div`.
- **Layout can be less convenient**: SVG has its own coordinate system via `viewBox`, so aligning text or icons inside or over it often needs a wrapper with absolute positioning.
- **Foundry drag/drop and form interactions**: if the SVG sits on top of inputs or buttons, it can accidentally intercept pointer events unless you set `pointer-events: none` on decorative SVG layers.
- **Accessibility needs manual care**: decorative SVGs should be `aria-hidden="true"`; meaningful SVGs need titles or labels. Plain HTML buttons and inputs get more for free.
- **Scaling and stroke quirks**: outlines may look too thick or too thin at different sizes unless you use `vector-effect: non-scaling-stroke` or tune stroke widths carefully.
- **Harder to inspect and tweak**: polygon points and paths are less obvious than CSS width, border, padding, and background.
- **Template readability**: actor sheets already tend to have dense Handlebars. Repeating inline SVG paths can make templates harder to scan.

## Mitigations

- Put the SVG in a small reusable partial or component rather than repeating a large block everywhere.
- Keep text outside the SVG unless the text is purely decorative.
- Use `aria-hidden="true"` for decorative SVGs.
- Use `pointer-events: none` on decorative SVG layers.
- Use CSS variables for fill, stroke, hover, active, disabled, and theme states.
- Use `vector-effect: non-scaling-stroke` when the chip may render at multiple sizes.
- Keep the `viewBox` consistent so all chip variants scale predictably.

## Practical Recommendation

Use SVG for the actual diamond or custom outline, but make it decorative and reusable. Keep the button and input semantics in normal HTML, keep the label outside the SVG, and put `pointer-events: none` on the SVG unless the SVG itself is meant to be interactive.
