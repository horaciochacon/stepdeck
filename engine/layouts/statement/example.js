// Example slide using the statement layout: one sentence, key words in bold.
export default {
  id: "statement-example",
  layout: "statement",
  elements: [
    { id: "claim", region: "main", type: "markdown",
      props: { md: "Most of the rise in response comes **above** 250 mg, on both regimens." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example." } },
  ],
};
