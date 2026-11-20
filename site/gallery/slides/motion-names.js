// Motion gallery: the named motions. Four cards enter with the four box motions (fade, rise, wipe, pop); then a
// fifth card wipes in (`draw` on a plain box plays a wipe) and a bar chart, which owns its entrance, builds
// itself while its box stays still. All six arrive on one step, one stagger slot apart. Data: data/motion-channels.csv.
const CARD = `
  :scope > [data-region="main"] {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
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
  [data-el^="card-"] .sd-markdown h3 { margin-bottom: calc(var(--sd-space) / 2); color: var(--sd-color-accent); }
  [data-el^="card-"] .sd-markdown p { font-size: var(--sd-font-size-note); color: var(--sd-color-muted); }
  [data-el="card-draw"] { align-self: start; }
  [data-el="chart"] { grid-column: 2 / -1; }
  [data-el="src"] { grid-column: 1 / -1; }
`;

const card = (id, motion, md) => ({ id: `card-${id}`, region: "main", type: "markdown", props: { md }, enter: motion, from: "go" });

export default {
  id: "motion-names",
  layout: "full-bleed",
  title: "Five ways in",
  lede: "Each element enters with a named motion, one stagger slot after the last.",
  style: CARD,
  elements: [
    card("fade", "fade", "### Fade\n\nOpacity, nothing else."),
    card("rise", "rise", "### Rise\n\nUp from below as it fades in."),
    card("wipe", "wipe", "### Wipe\n\nRevealed from left to right."),
    card("pop", "pop", "### Pop\n\nA small scale up, with a lift."),
    card("draw", "draw", "### Draw\n\nA chart builds itself; a plain box wipes."),
    { id: "chart", region: "main", type: "chart.bar", from: "go",
      props: { data: "data/motion-channels.csv", x: "channel", y: "signups", format: { y: ",.0f" }, axes: { y: "Sign-ups" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "go", transition: { stagger: 240 } },
  ],
  notes: "The four box motions, then draw: a plain box wipes, a chart builds itself. Reference: docs/guide/animation-and-motion.md",
};
