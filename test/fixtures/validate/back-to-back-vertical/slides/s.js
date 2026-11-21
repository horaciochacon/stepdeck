// Back-to-back bars extend left and right of a centre rule: they are horizontal only.
export default {
  id: "s", layout: "figure-notes", title: "A vertical pyramid",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/pyramid.csv", x: "age", y: "share", mode: "back-to-back", group: "group", groups: ["Group A", "Group B"], orient: "vertical" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
};
