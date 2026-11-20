// The card style: each message is a bordered card with its label on top (the prompt look).
export default {
  id: "card",
  layout: "full-bleed",
  title: "Encargo",
  elements: [
    { id: "chat", region: "main", type: "chat",
      props: { style: "card", messages: [
        { role: "user", label: "El encargo", text: "Revisa los **datos**, ajusta el modelo y entrega un informe breve." },
        { role: "note", label: "Nota", text: "Sin tocar la carpeta `raw/`." },
      ] } },
  ],
};
