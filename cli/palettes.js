// Palette checker (spec §7). Dev tooling only; nothing here is needed to present.
//
// checkPalette(palette, background, { cvd = true, minContrast = 3, minDeltaE = CVD_MIN_DELTA_E }) -> Problem[]
//   palette      a palettes.json entry ({ name?, kind, colors: [{ id, value, names }] }) or a plain array
//                of hex strings (treated as categorical marks).
//   background   the theme background, hex (themes/<theme>/tokens.css --sd-color-background).
//   Rules:
//   - palette-contrast  every categorical color (a mark: line, point, label) has WCAG 2 contrast of at
//                       least 3:1 against the background. Sequential and diverging palettes are area
//                       fills read against each other and a legend, so their light ends (viridis yellow,
//                       the diverging neutral) are exempt by design.
//   - palette-cvd       every pair of categorical colors stays at least CVD_MIN_DELTA_E apart (CIEDE2000)
//                       under simulated protanopia, deuteranopia and tritanopia (Machado, Oliveira and
//                       Fernandes 2009, severity 1). Off with { cvd: false }.
//   Problems use cli/problems.js: element is "<palette>/<color id>" ("<palette>/<a>+<b>" for a pair).
//
// Helpers (exported for tests and for deriving palettes):
//   contrast(a, b)                      WCAG 2 contrast ratio (1–21), unrounded
//   darkenToContrast(hex, bg, target)   the lightest color with the same OKLab hue and chroma direction
//                                       whose (hex-rounded) contrast against bg is at least target
//   simulateCvd(hex, type)              hex as seen with protanopia | deuteranopia | tritanopia
//   deltaE(a, b)                        CIEDE2000 color difference between two hex colors
import { problem } from "./problems.js";
import { parseHex, toLinear, luminance as relativeLuminance, contrast as ratio } from "#engine/core/color.js";

export { parseHex };

export const CVD_TYPES = ["protanopia", "deuteranopia", "tritanopia"];
// Below ~8 (CIEDE2000) two thin lines in a chart are hard to tell apart without labels.
export const CVD_MIN_DELTA_E = 8;

export function toHex(rgb) {
  return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

const fromLinear = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** WCAG 2 relative luminance. */
export const luminance = (hex) => relativeLuminance(parseHex(hex));

export const contrast = (a, b) => ratio(luminance(a), luminance(b));

// OKLab (Björn Ottosson, 2020), from and to linear sRGB.
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (rgb) => rgb.every((c) => c >= -1e-6 && c <= 1 + 1e-6);

/** Lowers OKLab lightness (hue kept; chroma reduced only if it leaves the sRGB gamut) until contrast >= target. */
export function darkenToContrast(hex, background, target = 3) {
  if (contrast(hex, background) >= target) return toHex(parseHex(hex));
  const [L0, a0, b0] = linearToOklab(parseHex(hex).map(toLinear));
  for (let L = L0; L > 0; L -= 0.002) {
    let k = 1;
    let lin = oklabToLinear([L, a0, b0]);
    while (!inGamut(lin) && k > 0) {
      k -= 0.01;
      lin = oklabToLinear([L, a0 * k, b0 * k]);
    }
    const out = toHex(lin.map(fromLinear)); // toHex clamps to 0..1
    if (contrast(out, background) >= target) return out;
  }
  return "#000000";
}

// Machado, Oliveira and Fernandes (2009), severity 1.0, applied to linear RGB.
const MACHADO = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

export function simulateCvd(hex, type) {
  const m = MACHADO[type];
  if (!m) throw new Error(`unknown color-vision deficiency '${type}' (known: ${CVD_TYPES.join(", ")})`);
  const lin = parseHex(hex).map(toLinear);
  const out = m.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
  return toHex(out.map(fromLinear)); // toHex clamps to 0..1
}

// CIELAB (D65) and CIEDE2000.
function lab(hex) {
  const [r, g, b] = parseHex(hex).map(toLinear);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function deltaE(c1, c2) {
  const [L1, a1, b1] = lab(c1);
  const [L2, a2, b2] = lab(c2);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hp = (a, b) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1p = hp(a1p, b1);
  const h2p = hp(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
    + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Cbp7 = Cbp ** 7;
  const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

// Rounded down, so a failing ratio never prints as the limit ("2.96" is "2.9:1", not "3.0:1").
const ratioText = (r) => `${Math.floor(r * 10) / 10}:1`;

function normalize(palette) {
  if (Array.isArray(palette)) {
    return { name: null, kind: "categorical", colors: palette.map((value) => ({ id: null, value })) };
  }
  return { name: palette?.name ?? null, kind: palette?.kind ?? "categorical", colors: palette?.colors ?? [] };
}

export function checkPalette(palette, background, { cvd = true, minContrast = 3, minDeltaE = CVD_MIN_DELTA_E } = {}) {
  const p = normalize(palette);
  if (p.kind !== "categorical") return [];
  const where = (id) => (p.name && id ? `${p.name}/${id}` : id ?? null);
  const label = (c) => (c.id ? `${c.id} (${c.value})` : c.value);
  const problems = [];
  for (const c of p.colors) {
    const r = contrast(c.value, background);
    if (r >= minContrast) continue;
    problems.push(problem({
      element: where(c.id),
      rule: "palette-contrast",
      measured: ratioText(r),
      limit: `${minContrast}:1`,
      fix: `darken ${label(c)} to ${darkenToContrast(c.value, background, minContrast)} or darker (marks need ${minContrast}:1 on ${background})`,
    }));
  }
  if (!cvd) return problems;
  for (let i = 0; i < p.colors.length; i++) {
    for (let j = i + 1; j < p.colors.length; j++) {
      const [a, b] = [p.colors[i], p.colors[j]];
      let worst = null;
      for (const type of CVD_TYPES) {
        const d = deltaE(simulateCvd(a.value, type), simulateCvd(b.value, type));
        if (!worst || d < worst.d) worst = { d, type };
      }
      if (worst.d >= minDeltaE) continue;
      const pair = a.id && b.id ? `${a.id}+${b.id}` : `${a.value}+${b.value}`;
      problems.push(problem({
        element: p.name ? `${p.name}/${pair}` : pair,
        rule: "palette-cvd",
        measured: `ΔE ${Math.round(worst.d * 10) / 10} (${worst.type})`,
        limit: `ΔE ${minDeltaE}`,
        fix: `change the lightness of ${label(a)} or ${label(b)} so they differ for ${worst.type}, or drop one`,
      }));
    }
  }
  return problems;
}
