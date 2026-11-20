// Motion gallery: choreography within one step. Five elements enter on the step `go`, each held until its stagger
// slot: three cards enter in turn (with the theme's entrance: they rise in modern and fade in academic-light), then
// the line chart (which owns its entrance) draws in the fourth slot, then the list builds item by item in the fifth. Data: data/motion-summary.json and data/motion-weekly.csv.
const GRID = `
  :scope > [data-region="main"] {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: calc(var(--sd-space) * 2);
    padding-top: calc(var(--sd-region-gap) * 2);
  }
  [data-el^="card-"] {
    padding: calc(var(--sd-space) * 1.5) calc(var(--sd-space) * 2);
    border: var(--sd-rule-width) solid var(--sd-color-rule);
    border-radius: calc(var(--sd-grid) * 2);
    background: var(--sd-color-surface);
  }
  [data-el^="card-"] .sd-markdown h2 { margin-bottom: calc(var(--sd-space) / 4); font-size: var(--sd-font-size-title); }
  [data-el^="card-"] .sd-markdown p { font-size: var(--sd-font-size-note); color: var(--sd-color-muted); }
  [data-el="chart"] { grid-column: 1 / 3; }
  [data-el="next"] { align-self: center; }
  [data-el="src"] { grid-column: 1 / -1; }
`;

const SUMMARY = "data/motion-summary.json";
const card = (id, md) => ({ id: `card-${id}`, region: "main", type: "markdown", props: { md }, from: "go" });

export default {
  id: "motion-choreography",
  layout: "full-bleed",
  title: "One step, in order",
  lede: "Cards enter in turn; the chart waits for its slot, then draws; the list follows.",
  style: GRID,
  elements: [
    card("signups", `## {{${SUMMARY}#/signups | ,.0f}}\n\nsign-ups this quarter`),
    card("active", `## {{${SUMMARY}#/active | ,.0f}}\n\nactive after one week`),
    card("retention", `## {{${SUMMARY}#/retention | .0%}}\n\nof active users stay`),
    { id: "chart", region: "main", type: "chart.line", from: "go",
      props: { data: "data/motion-weekly.csv", x: "week", y: "signups", axes: { x: "Week", y: "Sign-ups per week" },
               format: { x: "d", y: ",.0f" } } },
    { id: "next", region: "main", type: "list", from: "go",
      props: { marker: "number", rule: true, items: [
        { text: "Welcome every sign-up" },
        { text: "Check in at week two" },
        { text: "Ask why people stay" },
      ] } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "go", transition: { stagger: 220 } },
  ],
  notes: "One step, five entrances, each in its stagger slot: the chart is held, then draws; the list builds item by item. Reference: docs/guide/animation-and-motion.md",
};
