// A floating box that starts near the right edge: its text runs past the 1920 px canvas.
export default {
  id: "s",
  layout: "full-bleed",
  elements: [
    { id: "lead", region: "main", type: "text", props: { text: "Everything here sits well inside." } },
    { id: "edge", type: "text", box: { x: 1700, y: 600, w: 600 }, props: { text: "This box crosses the edge." } },
  ],
};
