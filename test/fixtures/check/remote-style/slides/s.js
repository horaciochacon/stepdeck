// The canvas background comes from a remote URL; the browser harness blocks it (spec §3).
export default {
  id: "s",
  layout: "full-bleed",
  style: ':scope { background-image: url("https://stepdeck-remote.invalid/bg.png"); }',
  elements: [{ id: "lead", region: "main", type: "text", props: { text: "A slide with a remote background." } }],
};
