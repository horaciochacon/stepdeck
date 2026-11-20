// Motion gallery: ghost placeholders. Three panels in a row; before each one arrives, a dashed frame with its number
// and name holds its place, so the audience sees the shape of the argument first. Each step fills one frame: the
// two text panels rise in, and the figure counts up (big-number owns its entrance). Data: data/motion-summary.json.
const GRID = `
  :scope > [data-region="main"] {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: minmax(0, 1fr) auto;
    align-items: center;
    gap: calc(var(--sd-space) * 2);
  }
  [data-el^="panel-"] {
    min-height: calc(var(--sd-grid) * 54);
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: calc(var(--sd-space) * 2);
    border: var(--sd-rule-width) solid var(--sd-color-rule);
    border-radius: calc(var(--sd-grid) * 2);
    background: var(--sd-color-surface);
  }
  [data-el^="panel-"] > .sd-ghost { border-radius: calc(var(--sd-grid) * 2); border-color: var(--sd-color-dim); }
  [data-el^="panel-"] .sd-ghost-label { font-size: var(--sd-font-size-heading); }
  [data-el^="panel-"] .sd-markdown h3 { color: var(--sd-color-accent); }
  [data-el="src"] { grid-column: 1 / -1; }
`;

export default {
  id: "motion-ghost",
  layout: "full-bleed",
  title: "Question, method, answer",
  lede: "Dashed frames hold each panel's place until it arrives.",
  style: GRID,
  elements: [
    { id: "panel-question", region: "main", type: "markdown", ghost: "1 · Question", from: "question",
      props: { md: "### Question\n\nDo the people who sign up keep coming back?" } },
    { id: "panel-method", region: "main", type: "markdown", ghost: "2 · Method", from: "method",
      props: { md: "### Method\n\nFollow one quarter of sign-ups for eight weeks." } },
    { id: "panel-answer", region: "main", type: "big-number", ghost: "3 · Answer", from: "answer",
      props: { value: "{{data/motion-summary.json#/retention}}", format: ".0%", label: "of active users are still active at week eight" } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "frames" },
    { id: "question" },
    { id: "method" },
    { id: "answer" },
  ],
  notes: "ghost: a dashed, labelled frame in the element's space while it is hidden; it goes when the element enters. Reference: docs/guide/animation-and-motion.md",
};
