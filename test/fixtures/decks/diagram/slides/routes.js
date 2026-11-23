// Edges routed around the grid. A labelled "next round" loop over the top, from the last node (report) back to the
// first (plan); a self-loop over one node; a labelled side loop on the left and one on the right (their labels turn);
// an under edge into a circle; and a dashed under edge into a group. The steps show the routed edges one by one,
// then highlight the loop.
const BASE = ["plan", "collect", "fit", "draft", "clean", "merge", "archive", "report", "prep", "plan->collect", "collect->fit", "fit->report", "clean->merge"];
const ROUTED = ["again", "refit", "notes", "keep", "redo", "feed"];
const upTo = (n) => [...BASE, ...ROUTED.slice(0, n)];
export default {
  id: "routes",
  layout: "full-bleed",
  title: "Edges around the grid",
  elements: [
    { id: "routes", region: "main", type: "diagram",
      props: {
        cols: 4, rows: 2,
        nodes: [
          { id: "plan", label: "Plan", shape: "box", col: 0, row: 0 },
          { id: "collect", label: "Collect", shape: "box", col: 1, row: 0 },
          { id: "fit", label: "Fit", shape: "pill", col: 2, row: 0 },
          { id: "draft", label: "Draft", shape: "box", col: 0, row: 1 },
          { id: "clean", label: "Clean", shape: "circle", col: 1, row: 1 },
          { id: "merge", label: "Merge", shape: "box", col: 2, row: 1 },
          { id: "archive", label: "Archive", shape: "box", col: 3, row: 1 },
          { id: "report", label: "Report", shape: "box", col: 3, row: 0 },
        ],
        edges: [
          { from: "plan", to: "collect" },
          { from: "collect", to: "fit" },
          { from: "fit", to: "report" },
          { from: "clean", to: "merge" },
          { id: "refit", from: "fit", to: "fit", route: "over" },
          { id: "again", from: "report", to: "plan", route: "over", label: "next round" },
          { id: "notes", from: "plan", to: "draft", route: "left", label: "notes" },
          { id: "keep", from: "report", to: "archive", route: "right", label: "kept" },
          { id: "redo", from: "draft", to: "clean", route: "under" },
          { id: "feed", from: "archive", to: "prep", route: "under", dashed: true },
        ],
        groups: [{ id: "prep", label: "Prepare", contains: ["clean", "merge"] }],
        shown: upTo(0),
      } },
  ],
  steps: [
    { id: "start" },
    ...ROUTED.map((id, i) => ({ id, set: { routes: { shown: upTo(i + 1) } } })),
    { id: "focus", set: { routes: { highlight: ["report", "plan", "again"] } } },
  ],
};
