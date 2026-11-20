// Example slide using the halves layout: a prompt on the left, tasks that build up on the right.
export default {
  id: "halves-example",
  layout: "halves",
  title: "Prompt and tasks",
  elements: [
    { id: "prompt", region: "left", type: "markdown",
      props: { md: "Which participants respond first when the dose **doubles**?" } },
    { id: "t1", region: "right", type: "text", props: { text: "1. Tabulate responses by dose." } },
    { id: "t2", region: "right", type: "text", from: "more", props: { text: "2. Join them to the participant list." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example." } },
  ],
  steps: [{ id: "base" }, { id: "more" }],
};
