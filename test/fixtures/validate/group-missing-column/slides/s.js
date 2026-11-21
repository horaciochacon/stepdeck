// The pyramid is fine at the first step; the second step names a `group` column that is not there.
export default {
  id: "s", layout: "figure-notes", title: "Missing group column",
  elements: [
    { id: "bars", region: "main", type: "chart.bar", props: { data: "data/pyramid.csv", x: "age", y: "share", mode: "back-to-back", group: "group" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "one" },
    { id: "two", set: { bars: { group: "groups" } } },
  ],
};
