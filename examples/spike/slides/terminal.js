// Hard case 2: a terminal with an internal sequence. The slide never patches the terminal's
// content; `advance` sets its `shown` prop step by step (spec §6.2), the component renders props.
// Steps: open (0 events), inspect (4), summarize (9), fix (14), report (18), done (22).
export default {
  id: "terminal",
  section: "Agents",
  layout: "full-bleed",
  title: "An agent works through a task",
  elements: [
    { id: "term", region: "main", type: "terminal",
      props: { script: "data/session.json", shown: 0, typing: true },
      advance: { prop: "shown", values: [0, 4, 9, 14, 18, 22], start: "open" } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic agent session." } },
  ],
  steps: [
    { id: "open" },
    { id: "inspect" },
    { id: "summarize" },
    { id: "fix" },
    { id: "report" },
    { id: "done" },
  ],
  seconds: 90,
};
