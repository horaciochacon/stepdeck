// Three nested labelled groups, shaped like the kit's "computer > project folder > agent" diagram: the agent
// group holds three pills. Every label must stay clear of the others and of the pills.
export default {
  id: "nest",
  layout: "full-bleed",
  title: "Where the agent works",
  elements: [
    { id: "nest", region: "main", type: "diagram",
      props: {
        cols: 3, rows: 1,
        nodes: [
          { id: "read", label: "Reads files", shape: "pill", col: 0, row: 0 },
          { id: "run", label: "Runs commands", shape: "pill", col: 1, row: 0 },
          { id: "edit", label: "Edits code", shape: "pill", col: 2, row: 0 },
        ],
        groups: [
          { id: "agent", label: "Agent", contains: ["read", "run", "edit"] },
          { id: "folder", label: "Project folder", contains: ["agent"], dashed: true },
          { id: "computer", label: "Computer", contains: ["folder"] },
        ],
      } },
  ],
};
