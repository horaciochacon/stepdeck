// The Markdown blocks beyond paragraphs and lists: a table with aligned columns, the small headings, a rule and
// task items. All values are synthetic.
export default {
  id: "mdblocks",
  layout: "halves",
  title: "Bloques",
  elements: [
    { id: "table", region: "left", type: "markdown",
      props: { md: "| Grupo | Casos | Tasa |\n| --- | ---: | :---: |\n| Norte | 120 | **4,1** |\n| Sur | 86 | 2,9 |\n\nUn párrafo tras la tabla.\n\n---\n\nTras la regla." } },
    { id: "small", region: "right", type: "markdown",
      props: { md: "##### Título cinco\n\n###### Título seis\n\n- [x] Tarea hecha\n- [ ] Tarea abierta\n- Un punto normal" } },
  ],
};
