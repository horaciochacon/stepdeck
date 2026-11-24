// Locale-aware number formatting built on d3-format (from the vendored d3 bundle, via ./d3.js).
// Runs unchanged in Node and in the browser. Formats are d3-format specifier strings
// (",.0f", ".1%", "~s"...); the deck language only changes the separators.
//
// Note: d3-format renders negative numbers with a true minus sign (U+2212), in every locale.
import { d3 } from "./d3.js";
import { langKey } from "./kit.js";

const LOCALES = {
  en: { decimal: ".", thousands: ",", grouping: [3], currency: ["$", ""] },
  es: { decimal: ",", thousands: ".", grouping: [3], currency: ["", " €"] },
};

const built = new Map();

function localeFor(lang) {
  if (!built.has(lang)) built.set(lang, d3.formatLocale(LOCALES[lang]));
  return built.get(lang);
}

/**
 * makeFormat(lang) -> (spec) => (n) => string
 * A regional tag uses its language (`es-PE` formats as `es`); unknown languages fall back to `en`. An invalid spec throws (d3: "invalid format: <spec>").
 */
export function makeFormat(lang) {
  const locale = localeFor(langKey(LOCALES, lang));
  const cache = new Map();
  return (spec) => {
    if (!cache.has(spec)) cache.set(spec, locale.format(spec));
    return cache.get(spec);
  };
}
