// Motion gallery: focus-dim. A funnel drawn twice, as a diagram and as bars; each step moves the highlight to the
// next stage in both, and everything out of focus turns the theme's neutral dim colour (opacity stays 1, text turns
// muted). Data: data/motion-funnel.csv.
const ids = ["visited", "signed", "active", "retained"];
const edge = (i) => `${ids[i]}->${ids[i + 1]}`;
// The diagram's parts in focus at a stage: its node and the arrow that leads into it.
const focus = (i) => (i === 0 ? [ids[0]] : [edge(i - 1), ids[i]]);

export default {
  id: "motion-focus",
  layout: "halves",
  title: "Where the users go",
  lede: "The highlight moves one stage at a time; the rest turns a quiet grey.",
  regions: { "--split": "2fr 3fr", "--gutter": "96px" },
  elements: [
    { id: "flow", region: "left", type: "diagram",
      props: {
        cols: 1, rows: 4,
        nodes: [
          { id: "visited", label: "Visited", shape: "pill", col: 0, row: 0 },
          { id: "signed", label: "Signed up", shape: "pill", col: 0, row: 1 },
          { id: "active", label: "Active", shape: "pill", col: 0, row: 2 },
          { id: "retained", label: "Retained", shape: "pill", col: 0, row: 3 },
        ],
        edges: [0, 1, 2].map((i) => ({ from: ids[i], to: ids[i + 1] })),
      } },
    { id: "bars", region: "right", type: "chart.bar",
      props: { data: "data/motion-funnel.csv", x: "stage", y: "users", format: { y: ",.0f" }, axes: { y: "Users" } } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "all" },
    { id: "signed", set: { flow: { highlight: focus(1) }, bars: { highlight: "Signed up" } } },
    { id: "active", set: { flow: { highlight: focus(2) }, bars: { highlight: "Active" } } },
    { id: "retained", set: { flow: { highlight: focus(3) }, bars: { highlight: "Retained" } } },
  ],
  notes: "Focus-dim in chart.bar and diagram: the dimmed parts take --sd-color-dim at full opacity, their text the muted colour. Reference: docs/guide/animation-and-motion.md",
};
