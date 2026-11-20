// An unknown color role is an element error naming the role; the sibling element carries on.
export default {
  id: "badcolor",
  layout: "full-bleed",
  elements: [
    { id: "bad", region: "main", type: "markdown", props: { md: "El {{color:chartreuse}} no existe." } },
    { id: "ok", region: "main", type: "markdown", props: { md: "Este sigue: {{color:accent}}." } },
  ],
};
