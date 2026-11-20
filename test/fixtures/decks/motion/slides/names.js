// One text element per box motion, all entering on one step. The step's stagger is 0, so every box is in
// flight at the same moment.
export default {
  id: "names",
  layout: "full-bleed",
  title: "Five ways in",
  elements: [
    { id: "fade", region: "main", type: "text", props: { text: "Fade: opacity only" }, enter: "fade", from: "go" },
    { id: "rise", region: "main", type: "text", props: { text: "Rise: up from below" }, enter: "rise", from: "go" },
    { id: "wipe", region: "main", type: "text", props: { text: "Wipe: left to right" }, enter: "wipe", from: "go" },
    { id: "pop", region: "main", type: "text", props: { text: "Pop: a small scale up" }, enter: "pop", from: "go" },
    { id: "draw", region: "main", type: "text", props: { text: "Draw: a wipe on a plain box" }, enter: "draw", from: "go" },
  ],
  steps: [{ id: "start" }, { id: "go", transition: { stagger: 0 } }],
};
