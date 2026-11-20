// Two floating boxes placed almost on top of each other.
export default {
  id: "s",
  layout: "full-bleed",
  elements: [
    { id: "a", type: "text", box: { x: 200, y: 300, w: 900 }, props: { text: "First label" } },
    { id: "b", type: "text", box: { x: 230, y: 315, w: 900 }, props: { text: "Second label" } },
  ],
};
