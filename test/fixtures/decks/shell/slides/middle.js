// Between the other two, so in the reveal shell `notitle` is not mounted while `plain` is on screen.
export default {
  id: "middle",
  title: "The *middle* one",
  elements: [{ id: "t", region: "main", type: "text", props: { text: "In between." } }],
};
