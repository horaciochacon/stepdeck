// One deliberately long message per style wraps inside its box instead of overflowing.
const messages = [
  { role: "user", label: "Tú", text: "Este mensaje es deliberadamente muy largo para comprobar que el texto se ajusta a la anchura de su burbuja en lugar de desbordarse por el borde del lienzo, y que sigue siendo legible aunque ocupe varias líneas" },
  { role: "agent", label: "Agente", text: "Respuesta corta." },
];
export default {
  id: "long",
  layout: "full-bleed",
  title: "Texto largo",
  elements: [
    { id: "chat", region: "main", type: "chat", props: { style: "bubbles", messages } },
  ],
};
