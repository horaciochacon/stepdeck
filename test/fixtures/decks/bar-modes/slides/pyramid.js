// A population pyramid: one band per age group, the first group's bars extending left of a centre rule and the second
// group's right, each with an interval whisker on a halo. The value ticks read as magnitudes on both sides, and each
// side has a title in its group's colour. Bands appear (`all`), then `y` and the interval switch to a later year: the
// axis covers every step of the slide from the start, so it never moves.
export default {
  id: "pyramid",
  layout: "full-bleed",
  title: "Two groups, back to back",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/pyramid.csv", x: "age", y: "share", mode: "back-to-back", group: "group",
               interval: { lower: "low", upper: "high" }, shown: ["0-14", "15-29", "30-44"], format: { y: ",.1f" },
               axes: { x: "Age", y: "Share of the population (%)" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "start" },
    { id: "all", set: { bars: { shown: null } } },
    { id: "later", set: { bars: { y: "later", interval: { lower: "later_low", upper: "later_high" } } } },
  ],
};
