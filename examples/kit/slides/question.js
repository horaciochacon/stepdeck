// The research question on the `statement` layout; markdown makes the two key terms bold.
export default {
  id: "question",
  layout: "statement",
  elements: [
    { id: "claim", region: "main", type: "markdown",
      props: { md: "Does more **exposure** lead to a worse **outcome**, and by how much?" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "A synthetic research question." } },
  ],
};
