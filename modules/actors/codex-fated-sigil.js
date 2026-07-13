/**
 * Fated Sigils — Eldritch Horror · Fate.
 *
 * A deterministic, per-actor "wall of worn sigils" generated at runtime on an
 * offscreen canvas and cached as a PNG data-URL, used as the ALPHA mask for the
 * Fate sheet-header ornament (the Fate counterpart to Scholar's static sigil.svg).
 *
 * Ported from the crea "foundry_fated_sigils" handoff: a crisp 512 sigil tile is
 * laid 2×2 into a 1024 canvas, then multiplied by a fog/wear mask built from
 * layered value noise → soft threshold → empty patches → scratches → grain. Each
 * layer draws from its own salted PRNG so they vary independently but stay stable
 * for a given seed (so an actor sees the same sigil every time).
 *
 * The output encodes visibility in the ALPHA channel (RGB = white), so it works
 * as a CSS alpha mask (mask-mode:alpha / -webkit-mask-image) over a coloured fill.
 */

/* ---- deterministic PRNG (xmur3 seed → mulberry32 stream) ------------------- */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rngFromSeed(source, salt = "") {
  return mulberry32(xmur3(`${source}::${salt}`)());
}

/**
 * Art-direction defaults. Based on the handoff, but the wear is reworked: the
 * handoff's "extreme" patch tuning (264 large ellipses) covered the whole tile
 * and zeroed everything, so instead we start from mostly-visible and carve holes
 * with a cloud ramp + a handful of empty patches. Tune to taste.
 */
export const CDX_FATED_DEFAULTS = {
  style: "deco",          // "deco" = ported mystic_patterns wall; "medallion" = bespoke sigil
  sigilSize: 512,
  fogSize: 1024,
  // cloud ramp: noise below cloudLow → visFloor, above cloudHigh → fully visible.
  // visFloor raised to 0.5 makes the cloud ~1.5x less impactful (swing 0.75→0.5).
  cloudLow: 0.34,
  cloudHigh: 0.72,
  visFloor: 0.5,
  // empty patches (missing regions carved out of the wall)
  patchCount: 17,          // 1.5x fewer than the previous 26
  patchScale: 1.25,
  // gouge scratches
  scratchCount: 34,
  scratchWidthMin: 3.0,
  scratchWidthMax: 6.0,
  minVisibility: 0.0,
};

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/** A blurred value-noise field (Float32Array, 0..255): a small random grid
 *  upscaled with bilinear smoothing, then Gaussian-blurred via the 2D filter. */
function noiseFloat(rng, size, cells, blur) {
  const small = makeCanvas(cells, cells);
  const sc = small.getContext("2d");
  const id = sc.createImageData(cells, cells);
  for (let i = 0; i < cells * cells; i++) {
    const v = (rng() * 255) | 0;
    id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255;
  }
  sc.putImageData(id, 0, 0);

  const big = makeCanvas(size, size);
  const bc = big.getContext("2d");
  bc.imageSmoothingEnabled = true;
  bc.imageSmoothingQuality = "high";
  if (blur > 0) bc.filter = `blur(${blur}px)`;
  bc.drawImage(small, 0, 0, cells, cells, 0, 0, size, size);
  bc.filter = "none";

  const d = bc.getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
  return out;
}

/** White ellipse "empty patches" on black, blurred; returns strength 0..1. */
function patchesFloat(rng, size, D) {
  const c = makeCanvas(size, size);
  const x = c.getContext("2d");
  x.fillStyle = "#000"; x.fillRect(0, 0, size, size);
  x.fillStyle = "#fff";
  const count = Math.round(D.patchCount);
  const rmul = D.patchScale;
  for (let i = 0; i < count; i++) {
    const cx = rng() * size, cy = rng() * size;
    const rx = (35 + rng() * 115) * rmul, ry = (22 + rng() * 88) * rmul;
    x.beginPath();
    x.ellipse(cx, cy, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
    x.fill();
  }
  const b = makeCanvas(size, size);
  const bc = b.getContext("2d");
  bc.filter = "blur(30px)";
  bc.drawImage(c, 0, 0);
  bc.filter = "none";
  const d = bc.getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}

/** White gouge "scratches" on black, softly blurred; returns strength 0..1. */
function scratchesFloat(rng, size, D) {
  const c = makeCanvas(size, size);
  const x = c.getContext("2d");
  x.fillStyle = "#000"; x.fillRect(0, 0, size, size);
  x.strokeStyle = "#fff"; x.lineCap = "round";
  const count = Math.round(D.scratchCount);
  for (let i = 0; i < count; i++) {
    const x0 = rng() * size, y0 = rng() * size;
    const ang = rng() * Math.PI * 2;
    const len = 70 + rng() * 190;
    const drift = (rng() * 2 - 1) * 28;
    const x1 = x0 + Math.cos(ang) * len + Math.cos(ang + Math.PI / 2) * drift;
    const y1 = y0 + Math.sin(ang) * len + Math.sin(ang + Math.PI / 2) * drift;
    x.lineWidth = D.scratchWidthMin + rng() * (D.scratchWidthMax - D.scratchWidthMin);
    x.globalAlpha = Math.min(1, (30 + rng() * 80) / 255);
    x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
  }
  x.globalAlpha = 1;
  const b = makeCanvas(size, size);
  const bc = b.getContext("2d");
  bc.filter = "blur(1.2px)";
  bc.drawImage(c, 0, 0);
  bc.filter = "none";
  const d = bc.getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}

/** Sparse fine grain (128-cell noise, thresholded); returns 0/1 per pixel. */
function grainFloat(rng, size) {
  const n = noiseFloat(rng, size, 128, 0.4);
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = n[i] > 238 ? 1 : 0;
  return out;
}

/** Fog/wear visibility (Float 0..1, 1 = intact). */
function makeWear(size, D, rFog, rPat, rScr, rGrn) {
  const broad = noiseFloat(rFog, size, 5, 38);
  const mid = noiseFloat(rFog, size, 11, 18);
  const fine = noiseFloat(rFog, size, 31, 4);
  const patch = patchesFloat(rPat, size, D);
  const scr = scratchesFloat(rScr, size, D);
  const grn = grainFloat(rGrn, size);

  const vis = new Float32Array(size * size);
  const cl = D.cloudHigh - D.cloudLow || 1;
  for (let i = 0; i < vis.length; i++) {
    // layered noise: lerp(broad, mid, .42) then lerp(result, fine, .14)
    let f = broad[i] * 0.58 + mid[i] * 0.42;
    f = f * 0.86 + fine[i] * 0.14;
    // cloud ramp → mostly visible, dimming toward visFloor in the dark clouds
    let c = (f / 255 - D.cloudLow) / cl;
    c = c < 0 ? 0 : c > 1 ? 1 : c;
    let v = D.visFloor + (1 - D.visFloor) * c;
    // carve wear out of it
    v -= patch[i];
    v -= scr[i] * 0.85;
    v -= grn[i] * 0.4;
    if (v < D.minVisibility) v = D.minVisibility;
    if (v < 0) v = 0; else if (v > 1) v = 1;
    vis[i] = v;
  }
  return vis;
}

/* ===========================================================================
   Style "medallion" — the original bespoke generator: a single centred sigil
   (rings / polygons / orbital ellipses / spokes / stars). Kept as an alternative
   to the ported deco wall below; selected via opts.style = "medallion".
   ========================================================================== */
/** One crisp geometric sigil (white linework on black), seeded for variety. */
function makeSigilTile(rng, size) {
  const c = makeCanvas(size, size);
  const x = c.getContext("2d");
  x.fillStyle = "#000"; x.fillRect(0, 0, size, size);
  x.translate(size / 2, size / 2);
  x.strokeStyle = "#fff"; x.fillStyle = "#fff";
  x.lineCap = "round"; x.lineJoin = "round";
  x.lineWidth = Math.max(1.1, size * 0.0026);
  const R = size * 0.42;

  // concentric rings, some dashed
  const rings = 3 + ((rng() * 3) | 0);
  for (let i = 0; i < rings; i++) {
    const r = R * (0.22 + 0.76 * (rings < 2 ? 1 : i / (rings - 1)));
    x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2);
    if (rng() < 0.55) x.setLineDash([1 + rng() * 3, 4 + rng() * 8]); else x.setLineDash([]);
    x.stroke();
  }
  x.setLineDash([]);

  // two nested polygons
  const sides = 3 + ((rng() * 5) | 0);
  const rot = rng() * Math.PI * 2;
  for (const rr of [R * 0.72, R * 0.44]) {
    x.beginPath();
    for (let k = 0; k < sides; k++) {
      const a = rot + (k / sides) * Math.PI * 2;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      k ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath(); x.stroke();
  }

  // orbital ellipses
  const orb = 2 + ((rng() * 3) | 0);
  for (let i = 0; i < orb; i++) {
    x.save(); x.rotate(rng() * Math.PI);
    x.beginPath(); x.ellipse(0, 0, R * 0.82, R * (0.2 + rng() * 0.28), 0, 0, Math.PI * 2); x.stroke();
    x.restore();
  }

  // radial spokes + diamond marks
  const spokes = [6, 8, 12][(rng() * 3) | 0];
  const s = size * 0.012;
  for (let i = 0; i < spokes; i++) {
    x.save(); x.rotate((i / spokes) * Math.PI * 2);
    x.beginPath(); x.moveTo(0, -R * 0.98); x.lineTo(0, -R * 0.86); x.stroke();
    const dy = -R * 0.9;
    x.beginPath(); x.moveTo(0, dy - s); x.lineTo(s, dy); x.lineTo(0, dy + s); x.lineTo(-s, dy); x.closePath(); x.stroke();
    x.restore();
  }

  // core
  x.beginPath(); x.arc(0, 0, R * 0.07, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(0, 0, R * 0.025, 0, Math.PI * 2); x.fill();

  // scattered small stars
  const stars = 3 + ((rng() * 4) | 0);
  for (let i = 0; i < stars; i++) {
    const a = rng() * Math.PI * 2, rr = R * (0.5 + rng() * 0.5);
    const sx = Math.cos(a) * rr, sy = Math.sin(a) * rr, ss = size * 0.01 * (0.7 + rng());
    x.beginPath(); x.moveTo(sx - ss, sy); x.lineTo(sx + ss, sy); x.moveTo(sx, sy - ss); x.lineTo(sx, sy + ss); x.stroke();
    x.beginPath(); x.arc(sx, sy, ss * 0.4, 0, Math.PI * 2); x.stroke();
  }
  return c;
}

/* ===========================================================================
   Style "deco" (default) — a faithful JS port of mystic_patterns.py's
   dense_deco_pattern(): a dense, SEAMLESS full-tile occult Art-Deco wall
   (diagonal lattices, diamond grids, deco glyphs, medallions, stepped frames,
   corner brackets, star-points, dot fields). Every element is drawn via dWrapped
   at 9 offsets so it tiles seamlessly. Variation is pure arithmetic from
   seed/mode (as in the source — the Python random.seed() calls are vestigial).
   Colours: WHITE primary lines, SOFT (grey) secondary → a natural mask hierarchy.
   ========================================================================== */
const DECO = 512;                       // the pattern's native tile size
const DW = "#fff", DS = "#b4b4b4";      // WHITE / SOFT
function dLine(d, pts, color, w) { d.strokeStyle = color; d.lineWidth = w; d.beginPath(); for (let i = 0; i < pts.length; i++) { const p = pts[i]; i ? d.lineTo(p[0], p[1]) : d.moveTo(p[0], p[1]); } d.stroke(); }
function dEll(d, x0, y0, x1, y1, color, w, fill) { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2; d.beginPath(); d.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); if (fill) { d.fillStyle = fill; d.fill(); } if (color && w) { d.strokeStyle = color; d.lineWidth = w; d.stroke(); } }
function dPoly(d, pts, color, w, fill) { d.beginPath(); for (let i = 0; i < pts.length; i++) { const p = pts[i]; i ? d.lineTo(p[0], p[1]) : d.moveTo(p[0], p[1]); } d.closePath(); if (fill) { d.fillStyle = fill; d.fill(); } if (color && w) { d.strokeStyle = color; d.lineWidth = w; d.stroke(); } }
function dArc(d, x0, y0, x1, y1, start, end, color, w) { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.abs(x1 - x0) / 2; d.beginPath(); d.arc(cx, cy, r, start * Math.PI / 180, end * Math.PI / 180, false); d.strokeStyle = color; d.lineWidth = w; d.stroke(); }
function dStar(cx, cy, r1, r2, n = 8, rot = -90) { const pts = []; for (let i = 0; i < n * 2; i++) { const a = (rot + i * 180 / n) * Math.PI / 180, r = i % 2 === 0 ? r1 : r2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return pts; }
function dDiamond(d, cx, cy, r, color, w, fill) { dPoly(d, [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]], color, w, fill); }
function dDot(d, cx, cy, r, fill) { dEll(d, cx - r, cy - r, cx + r, cy + r, fill, 1, fill); }
function dGlyph(d, cx, cy, kind) {
  dEll(d, cx - 17, cy - 17, cx + 17, cy + 17, DW, 2); dEll(d, cx - 10, cy - 10, cx + 10, cy + 10, DS, 1);
  const k = ((kind % 5) + 5) % 5;
  if (k === 0) { dLine(d, [[cx, cy - 24], [cx, cy + 24]], DW, 2); dLine(d, [[cx - 8, cy - 4], [cx + 8, cy - 4]], DW, 1); dEll(d, cx - 5, cy + 7, cx + 5, cy + 17, DW, 1); }
  else if (k === 1) { dArc(d, cx - 10, cy - 10, cx + 10, cy + 10, 55, 305, DW, 2); dLine(d, [[cx, cy - 22], [cx, cy + 22]], DW, 1); dLine(d, [[cx - 8, cy + 13], [cx + 8, cy + 13]], DW, 1); }
  else if (k === 2) { dLine(d, [[cx, cy - 20], [cx, cy + 20]], DW, 2); dLine(d, [[cx - 11, cy + 1], [cx + 11, cy + 1]], DW, 2); dEll(d, cx - 6, cy - 16, cx + 6, cy - 4, DW, 1); }
  else if (k === 3) { dArc(d, cx - 12, cy - 12, cx + 12, cy + 12, 92, 270, DW, 2); dEll(d, cx + 2, cy - 8, cx + 14, cy + 8, DW, 1); }
  else { dLine(d, [[cx - 10, cy - 10], [cx + 10, cy + 10]], DW, 2); dLine(d, [[cx - 10, cy + 10], [cx + 10, cy - 10]], DW, 1); dDot(d, cx, cy, 3, DW); }
}
function dBracket(d, x, y, sx, sy, w) { dLine(d, [[x, y + 34 * sy], [x, y], [x + 34 * sx, y]], DW, w); dLine(d, [[x + 12 * sx, y + 34 * sy], [x + 12 * sx, y + 12 * sy], [x + 34 * sx, y + 12 * sy]], DS, 1); }
function dTicks(d, cx, cy, radius, count, length, w) { for (let i = 0; i < count; i++) { const a = i * 360 / count * Math.PI / 180; dLine(d, [[cx + Math.cos(a) * (radius - length), cy + Math.sin(a) * (radius - length)], [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]], DW, w); } }
function dMedallion(d, cx, cy, seed, scale) {
  const r = 38 * scale, m = ((seed % 4) + 4) % 4;
  dEll(d, cx - r, cy - r, cx + r, cy + r, DW, 2); dEll(d, cx - r * 0.68, cy - r * 0.68, cx + r * 0.68, cy + r * 0.68, DS, 1);
  if (m === 0) dPoly(d, dStar(cx, cy, r * 0.78, r * 0.28, 8), DW, 2);
  else if (m === 1) { dPoly(d, [[cx, cy - r * 0.82], [cx + r * 0.72, cy + r * 0.42], [cx - r * 0.72, cy + r * 0.42]], DW, 2); dLine(d, [[cx - r * 0.5, cy], [cx + r * 0.5, cy]], DS, 1); }
  else if (m === 2) { dDiamond(d, cx, cy, r * 0.62, DW, 2); dLine(d, [[cx - r * 0.72, cy], [cx + r * 0.72, cy]], DS, 1); dLine(d, [[cx, cy - r * 0.72], [cx, cy + r * 0.72]], DS, 1); }
  else dGlyph(d, cx, cy, seed);
  dTicks(d, cx, cy, r * 1.08, 16 + (((seed % 3) + 3) % 3) * 8, 5, 1);
}
function dStepped(d, cx, cy, r, seed) {
  for (const sg of [-1, 1]) {
    dLine(d, [[cx + sg * r, cy - r * 0.8], [cx + sg * r * 0.62, cy - r * 0.8], [cx + sg * r * 0.62, cy - r * 0.45], [cx + sg * r * 0.25, cy - r * 0.45]], DW, 2);
    dLine(d, [[cx + sg * r, cy + r * 0.8], [cx + sg * r * 0.62, cy + r * 0.8], [cx + sg * r * 0.62, cy + r * 0.45], [cx + sg * r * 0.25, cy + r * 0.45]], DW, 2);
  }
  for (let a = 45; a < 360; a += 90) { const x = cx + Math.cos(a * Math.PI / 180) * r * 0.9, y = cy + Math.sin(a * Math.PI / 180) * r * 0.9; dDiamond(d, x, y, 8 + seed % 5, DS, 1); }
}
function dWrapped(fn) { for (const dx of [-DECO, 0, DECO]) for (const dy of [-DECO, 0, DECO]) fn(dx, dy); }

/** A seamless dense deco tile (512), ported from dense_deco_pattern(seed, mode). */
function makeDecoTile(seed, mode) {
  const c = makeCanvas(DECO, DECO);
  const d = c.getContext("2d");
  d.fillStyle = "#000"; d.fillRect(0, 0, DECO, DECO); d.lineJoin = "round"; d.lineCap = "round";
  const step = [64, 96, 128][mode % 3];
  const diag = (mode === 0 || mode === 3 || mode === 6 || mode === 9) ? 128 : 192;
  for (let x = -768; x <= 1280; x += step) {
    if (mode % 2 === 0) {
      dLine(d, [[x, 0], [x + diag, 128], [x, 256], [x + diag, 384], [x, 512]], DS, 1);
      dLine(d, [[x + step / 2, 0], [x + step / 2 - diag, 128], [x + step / 2, 256], [x + step / 2 - diag, 384], [x + step / 2, 512]], DW, 1);
    } else {
      dLine(d, [[x, 0], [x + 512, 512]], DS, 1);
      dLine(d, [[x + 512, 0], [x, 512]], DS, 1);
      dLine(d, [[x + 14, 0], [x + 526, 512]], DW, 1);
    }
  }
  if (mode === 1 || mode === 4 || mode === 7) {
    for (let y = 0; y <= 512; y += 64) dLine(d, [[0, y], [512, y]], y % 128 === 0 ? DW : DS, 1);
    for (let x = 0; x <= 512; x += 64) dLine(d, [[x, 0], [x, 512]], DS, 1);
  }
  const po = mode % 2 === 0 ? 0 : 128;
  for (const cx of [po, po + 256, po + 512]) for (const cy of [0, 256, 512]) {
    dWrapped((dx, dy) => dDiamond(d, cx + dx, cy + dy, 112 - (mode % 3) * 12, DW, 2));
    dWrapped((dx, dy) => dDiamond(d, cx + dx, cy + dy, 78 - (mode % 3) * 8, DS, 1));
    dWrapped((dx, dy) => dMedallion(d, cx + dx, cy + dy, seed + cx + cy + mode, 0.9));
    if (mode === 2 || mode === 5 || mode === 8) dWrapped((dx, dy) => dEll(d, cx + dx - 104, cy + dy - 104, cx + dx + 104, cy + dy + 104, DS, 1));
  }
  let secondary = [[128, 128], [384, 128], [128, 384], [384, 384]];
  if (mode % 3 === 1) secondary = [[64, 64], [192, 192], [320, 320], [448, 448], [64, 448], [448, 64]];
  else if (mode % 3 === 2) secondary = [[128, 0], [384, 0], [128, 256], [384, 256], [128, 512], [384, 512]];
  secondary.forEach(([cx, cy], i) => {
    dWrapped((dx, dy) => dMedallion(d, cx + dx, cy + dy, seed + i * 17, 0.65 + (i % 2) * 0.2));
    dWrapped((dx, dy) => dStepped(d, cx + dx, cy + dy, 64 + (i % 3) * 10, seed + i));
  });
  for (let x = 32; x < 512; x += 64) for (let y = 32; y < 512; y += 64) {
    if ((x * 3 + y + seed) % 128 === 0) dPoly(d, dStar(x, y, 15, 5, 8), DW, 1);
    else dDot(d, x, y, (x + y + seed) % 3 ? 1.8 : 2.5, DW);
    if ((Math.floor(x / 64) + Math.floor(y / 64) + mode) % 2 === 0) { dLine(d, [[x - 13, y], [x + 13, y]], DS, 1); dLine(d, [[x, y - 13], [x, y + 13]], DS, 1); }
  }
  for (let x = 0; x <= 512; x += 128) for (let y = 0; y <= 512; y += 128) {
    dWrapped((dx, dy) => dBracket(d, x + dx + 42, y + dy + 42, 1, 1, 1));
    dWrapped((dx, dy) => dBracket(d, x + dx + 86, y + dy + 42, -1, 1, 1));
    dWrapped((dx, dy) => dBracket(d, x + dx + 42, y + dy + 86, 1, -1, 1));
    dWrapped((dx, dy) => dBracket(d, x + dx + 86, y + dy + 86, -1, -1, 1));
  }
  if (mode === 3 || mode === 6 || mode === 9) {
    for (let y = 24; y < 512; y += 64) for (let x = 0; x <= 512; x += 128) {
      dLine(d, [[x, y], [x + 36, y], [x + 36, y + 18], [x + 84, y + 18], [x + 84, y]], DW, 1);
      dDot(d, x + 96, y, 2, DW);
    }
  }
  return c;
}

/** Red-channel luminance of a canvas as a Float32Array (0..1). */
function lumaFloat(c, size) {
  const d = c.getContext("2d").getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}

/** Sigil visibility (Float 0..1): a pre-built tile laid 2x2 into the fog canvas. */
function makeSigilVis(size, sigilSize, tile) {
  const c = makeCanvas(size, size);
  const x = c.getContext("2d");
  x.fillStyle = "#000"; x.fillRect(0, 0, size, size);
  const n = Math.max(1, Math.round(size / sigilSize));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    x.drawImage(tile, 0, 0, tile.width, tile.height, i * sigilSize, j * sigilSize, sigilSize, sigilSize);
  }
  return lumaFloat(c, size);
}

/**
 * Generate the fated-sigil alpha mask for a seed and return a PNG data-URL.
 * Visibility (sigil × wear) is written to the ALPHA channel, RGB = white.
 */
export function generateFatedSigilMask(seedSource, opts = {}) {
  const D = { ...CDX_FATED_DEFAULTS, ...opts };
  const size = D.fogSize;

  const vis = makeWear(size, D, rngFromSeed(seedSource, "fog"), rngFromSeed(seedSource, "patches"), rngFromSeed(seedSource, "scratches"), rngFromSeed(seedSource, "grain"));
  // Build the sigil visibility per style: "deco" (default) is the ported
  // mystic_patterns dense wall, tiled 2×2; "medallion" is the bespoke sigil drawn
  // ONCE, filling the canvas (a single sigil — for the Scholar header).
  let sig;
  if (D.style === "medallion") {
    const tile = makeSigilTile(rngFromSeed(seedSource, "sigil"), size);
    sig = lumaFloat(tile, size);
  } else {
    const h = xmur3(`${seedSource}::sigil`)() >>> 0;
    sig = makeSigilVis(size, D.sigilSize, makeDecoTile(h, h % 10));
  }

  // NB: the horizontal "emerge from the right" gradient is NOT baked here — it must
  // be sized to the header, not the tile, so it is a second CSS mask layer
  // (--cdx-fated-fade) composited with mask-composite:intersect on the header.
  const out = makeCanvas(size, size);
  const oc = out.getContext("2d");
  const img = oc.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    let a = sig[i] * vis[i];
    if (a < 0) a = 0; else if (a > 1) a = 1;
    img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = (a * 255) | 0;
  }
  oc.putImageData(img, 0, 0);
  return out.toDataURL("image/png");
}

/** Session cache: generate once per (seed, version), reuse forever. */
const _fatedCache = new Map();
export function getFatedSigilMask(seedSource, opts = {}) {
  const key = `${seedSource}::${opts.style ?? "deco"}::v1`;
  let url = _fatedCache.get(key);
  if (!url) {
    try {
      url = generateFatedSigilMask(seedSource, opts);
    } catch (e) {
      console.error("Codex | fated sigil generation failed", e);
      url = "";
    }
    _fatedCache.set(key, url);
  }
  return url;
}
