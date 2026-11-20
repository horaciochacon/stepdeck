// A text placed with a canvas box rises in; its inline left, top, width and height stay as they are.
export default {
  id: "boxed",
  layout: "full-bleed",
  title: "A placed box",
  elements: [
    { id: "placed", type: "text", box: { x: 160, y: 480, w: 960, h: 200 }, props: { text: "Placed on the canvas" }, enter: "rise", from: "go" },
  ],
  steps: [{ id: "start" }, { id: "go" }],
};
