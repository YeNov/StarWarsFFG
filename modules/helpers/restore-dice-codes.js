/**
 * Turn drawn dice glyphs back into the codes they were drawn from.
 *
 * Before closed `{{editor}}` blocks were kept out of sheet submits, a submit
 * could save the enriched display HTML — `<span class="dietype <theme> <type>">`
 * glyphs — over the `[CH]` / `[DI]` codes the user wrote. ProseMirror keeps such
 * a span as a mark and extends the last one over whatever is typed after it, so
 * the new text takes the glyph's colour and dice font. Running a field through
 * this before it reaches an editor gives the user their codes back, and the
 * next save stores them; the sheet draws the glyphs again from the codes.
 */

/** Glyph type (the span's last class) → the bracket code its enricher matches. */
const CODES = {
  ability: "[AB]",
  advantage: "[AD]",
  boost: "[BO]",
  challenge: "[CH]",
  dark: "[DA]",
  despair: "[DE]",
  difficulty: "[DI]",
  forcepoint: "[FP]",
  failure: "[FA]",
  force: "[FO]",
  light: "[LI]",
  proficiency: "[PR]",
  remsetback: "[RS]",
  restricted: "[RE]",
  setback: "[SE]",
  success: "[SU]",
  threat: "[TH]",
  triumph: "[TR]",
  adddifficulty: "[DD]",
  updifficulty: "[UD]",
  cancelthreat: "[CT]",
};

/** A span with no element inside it; nested glyphs are restored innermost first. */
const LEAF_SPAN = /<span\b([^>]*)>([^<]*)<\/span>/gi;
const CLASS_ATTR = /\bclass\s*=\s*(["'])(.*?)\1/i;

function restoreSpan(match, attrs, text) {
  const classes = (CLASS_ATTR.exec(attrs)?.[2] ?? "").split(/\s+/);
  if (!classes.includes("dietype")) return match;
  const type = classes.find((c) => c in CODES);
  if (!type) return match;
  // The glyph is the span's first character, or a run of d/i for the
  // difficulty ladders (:hard: draws "ddd", :average: "di"). Anything after it
  // was typed into the span by the editor bug and is kept as text.
  const ladder = type === "difficulty" ? /^[di]+/.exec(text)?.[0] : undefined;
  const glyph = ladder ?? /^\S/.exec(text)?.[0] ?? "";
  const count = ladder ? ladder.length : 1;
  return CODES[type].repeat(count) + text.slice(glyph.length);
}

/**
 * @param {string|null|undefined} html  A rich-text field as stored.
 * @returns {string} The same HTML with every dice glyph span replaced by its code.
 */
export function restoreDiceCodes(html) {
  let out = String(html ?? "");
  for (let prev = null; prev !== out; ) {
    prev = out;
    out = out.replace(LEAF_SPAN, restoreSpan);
  }
  return out;
}
