// Data story: back to back. Two groups' shares by age band extend left and right of a centre rule, each with an
// interval; one group is emphasized, then the other, then a single age band. Data: data/story-pyramid.csv.
export default {
  id: "story-pyramid",
  layout: "full-bleed",
  title: "Rural areas skew young, urban areas older",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/story-pyramid.csv", x: "age", y: "share", mode: "back-to-back", group: "group",
               groups: ["Urban", "Rural"], interval: { lower: "low", upper: "high" },
               format: { y: ",.0f" }, axes: { x: "Age", y: "Share of group, %" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "plain" },
    { id: "rural", only: { bars: { highlight: "Rural" } } },
    { id: "urban", only: { bars: { highlight: "Urban" } } },
    { id: "band", only: { bars: { highlight: "0-14" } } },
  ],
  notes: "Back to back: mode \"back-to-back\" with group; highlight takes a group or a category. Reference: docs/reference/components/chart-bar.md",
};
