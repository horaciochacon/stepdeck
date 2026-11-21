// One component, three steps: `k` moves every mark, and the slide places it on the canvas.
export default {
  id: "marks",
  layout: "full-bleed",
  title: "Shared chart marks",
  elements: [
    { id: "marks", type: "fixture.marks", box: { x: 160, y: 120, w: 1400, h: 760 },
      props: { data: "data/marks.csv", x: "t", y: "v", k: 0 } },
    { id: "src", type: "text", box: { x: 160, y: 920, w: 1400, h: 60 }, props: { role: "source", text: "Synthetic fixture." } },
  ],
  steps: [
    { id: "a" },
    { id: "b", set: { marks: { k: 1 } } },
    { id: "c", set: { marks: { k: 2 } } },
  ],
};
