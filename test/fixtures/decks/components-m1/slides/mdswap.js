// markdown: `tick` is on screen from the start and its text changes; `fresh` enters on "go".
export default {
  id: "mdswap",
  layout: "full-bleed",
  title: "Markdown swap",
  elements: [
    { id: "tick", region: "main", type: "markdown", props: { md: "Antes: **uno**" } },
    { id: "fresh", region: "main", type: "markdown", props: { md: "Entra con la caja" }, from: "go" },
  ],
  steps: [{ id: "start" }, { id: "go", set: { tick: { md: "Después: **dos**" } } }],
};
