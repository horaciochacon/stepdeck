// Nested `diagram` groups over four steps: the computer, the project folder inside it (with its files),
// the agent inside the folder, and finally the agent's three capabilities as pills, each acting on a file.
const pills = ["read", "run", "edit"];
const files = ["data", "scripts", "report"];
const arrows = ["read->data", "run->scripts", "edit->report"];
export default {
  id: "sandbox",
  layout: "full-bleed",
  title: "Where the agent works",
  elements: [
    { id: "nest", region: "main", type: "diagram",
      props: {
        cols: 2, rows: 3,
        nodes: [
          { id: "data", label: "`data/`", shape: "box", col: 0, row: 0 },
          { id: "scripts", label: "`scripts/`", shape: "box", col: 0, row: 1 },
          { id: "report", label: "`report.md`", shape: "box", col: 0, row: 2 },
          { id: "read", label: "Reads files", shape: "pill", col: 1, row: 0 },
          { id: "run", label: "Runs commands", shape: "pill", col: 1, row: 1 },
          { id: "edit", label: "Writes code", shape: "pill", col: 1, row: 2 },
        ],
        edges: [{ from: "read", to: "data" }, { from: "run", to: "scripts" }, { from: "edit", to: "report" }],
        groups: [
          { id: "agent", label: "Agent", contains: pills },
          { id: "folder", label: "Project folder", contains: ["agent", ...files], dashed: true },
          { id: "computer", label: "Your computer", contains: ["folder"] },
        ],
        shown: ["computer"],
      } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic diagram of an agent's workspace." } },
  ],
  steps: [
    { id: "computer" },
    { id: "folder", set: { nest: { shown: ["computer", "folder", ...files] } } },
    { id: "agent", set: { nest: { shown: ["computer", "folder", ...files, "agent"] } } },
    { id: "tools", set: { nest: { shown: ["computer", "folder", ...files, "agent", ...pills, ...arrows] } } },
  ],
};
