// Totals by age as plain bars, then the same ages split into two groups back to back, then the totals again. The data
// shapes differ (one row per band, or one per band and group), so a change of mode to or from back-to-back snaps.
export default {
  id: "pyramid-switch",
  layout: "full-bleed",
  title: "From totals to two groups",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/totals.csv", x: "age", y: "share", format: { y: ",.1f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "bars" },
    { id: "pyramid", set: { bars: { mode: "back-to-back", data: "data/pyramid.csv", group: "group" } } },
    { id: "again", set: { bars: { mode: "bars", data: "data/totals.csv", group: null } } },
  ],
};
