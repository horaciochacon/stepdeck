// UI strings for the shell. t(lang, key): unknown lang -> English, unknown key -> the key itself.

export const messages = {
  en: { section: "Section", step: "Step", of: "of", error: "Error", tasks: "Tasks", files: "Files", ci95: "95% CI", forecast: "Forecast" },
  es: { section: "Sección", step: "Paso", of: "de", error: "Error", tasks: "Tareas", files: "Archivos", ci95: "IC 95%", forecast: "Proyección" },
};

export function t(lang, key) {
  const table = Object.hasOwn(messages, lang) ? messages[lang] : messages.en;
  if (Object.hasOwn(table, key)) return table[key];
  return Object.hasOwn(messages.en, key) ? messages.en[key] : key;
}
