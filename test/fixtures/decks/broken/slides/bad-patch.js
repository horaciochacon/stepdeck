// Step 1 patches an element that does not exist: folding to step 1 throws.
export default {
  id: "bad-patch",
  layout: "full-bleed",
  elements: [{ id: "ok", region: "main", type: "text", props: { text: "Step zero is fine." } }],
  steps: [{ id: "start" }, { id: "oops", set: { ghost: { text: "no such element" } } }],
};
