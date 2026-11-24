// UI strings for the shell. t(lang, key): a regional tag reads its language (es-PE -> es), unknown lang -> English,
// unknown key -> the key itself.
import { langKey } from "./kit.js";

export const messages = {
  en: { section: "Section", step: "Step", of: "of", error: "Error", tasks: "Tasks", files: "Files", ci95: "95% CI", forecast: "Forecast", noData: "no data", total: "Total" },
  es: { section: "Sección", step: "Paso", of: "de", error: "Error", tasks: "Tareas", files: "Archivos", ci95: "IC 95%", forecast: "Proyección", noData: "sin datos", total: "Total" },
};

export function t(lang, key) {
  const table = messages[langKey(messages, lang)];
  if (Object.hasOwn(table, key)) return table[key];
  return Object.hasOwn(messages.en, key) ? messages.en[key] : key;
}
