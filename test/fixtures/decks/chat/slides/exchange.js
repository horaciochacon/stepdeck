// A bubble exchange revealed one message per step through `shown` (messages rise in).
export default {
  id: "exchange",
  layout: "full-bleed",
  title: "Intercambio",
  elements: [
    { id: "chat", region: "main", type: "chat",
      props: { style: "bubbles", shown: 0, messages: [
        { role: "user", label: "Tú", text: "¿Podemos **validar** el modelo con datos nuevos?" },
        { role: "agent", label: "Agente", text: "Sí. Propongo separar un conjunto de prueba y medir el error." },
        { role: "note", text: "Nota: el conjunto de prueba no se toca hasta el final." },
      ] },
      advance: { prop: "shown", values: [0, 1, 2, 3], start: "none" } },
  ],
  steps: [{ id: "none" }, { id: "one" }, { id: "two" }, { id: "three" }],
};
