// Bullets with inline markdown; raw html and an unsafe link must stay inert.
export default {
  id: "bullets",
  layout: "full-bleed",
  title: "Puntos",
  elements: [
    { id: "list", region: "main", type: "list",
      props: { marker: "bullet", items: [
        { text: "Con **negrita**, *cursiva* y `código`" },
        { text: "<img src=x onerror=\"window.__pwned=1\"> texto" },
        { text: "[malo](javascript:window.__pwned=1) y [bueno](#ok)" },
      ] } },
  ],
};
