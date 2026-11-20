// Example slide using `chat`: `advance` reveals one message per step through `shown`; with `typing` the
// newest message is typed as it appears. For a single prompt or quote, use `style: "card"` and one message.
export default {
  id: "chat-example",
  layout: "full-bleed",
  title: "A question and a proposal",
  elements: [
    { id: "exchange", region: "main", type: "chat",
      props: { style: "bubbles", typing: true, shown: 0, messages: [
        { role: "user", label: "You", text: "Can we **validate** the model on new data?" },
        { role: "agent", label: "Agent", text: "Yes. I propose holding out a test set and measuring the error." },
      ] },
      advance: { prop: "shown", values: [0, 1, 2], start: "start" } },
  ],
  steps: [{ id: "start" }, { id: "question" }, { id: "proposal" }],
};
