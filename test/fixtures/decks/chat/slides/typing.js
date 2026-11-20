// The same exchange with `typing`: the newest message is typed on a forward step.
export default {
  id: "typing",
  layout: "full-bleed",
  title: "Escribiendo",
  elements: [
    { id: "chat", region: "main", type: "chat",
      props: { style: "bubbles", typing: true, shown: 1, messages: [
        { role: "user", label: "Tú", text: "¿Podemos validar el modelo con datos nuevos antes de publicar los resultados del estudio?" },
        { role: "agent", label: "Agente", text: "Sí. Propongo separar un conjunto de prueba, medir el **error** y repetirlo con tres semillas distintas para comprobar que no es casualidad." },
        { role: "user", text: "De acuerdo, adelante." },
      ] },
      advance: { prop: "shown", values: [1, 2, 3], start: "first" } },
  ],
  steps: [{ id: "first" }, { id: "second" }, { id: "third" }],
};
