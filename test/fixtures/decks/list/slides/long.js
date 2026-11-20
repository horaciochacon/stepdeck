// One deliberately long item wraps inside its box instead of overflowing.
export default {
  id: "long",
  layout: "full-bleed",
  title: "Texto largo",
  elements: [
    { id: "list", region: "main", type: "list",
      props: { marker: "bullet", items: [
        { text: "Corto" },
        { text: "Este elemento es deliberadamente muy largo para comprobar que el texto se ajusta a la anchura de su caja en lugar de desbordarse por el borde derecho del lienzo, y que sigue siendo legible", sub: "Y también una línea secundaria bastante larga que debe ajustarse sin salirse de la región principal del diapositiva" },
      ] } },
  ],
};
