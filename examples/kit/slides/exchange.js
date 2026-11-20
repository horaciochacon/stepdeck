// `chat` bubbles with `typing`: a question, then the agent's proposal typed out, then the reply.
// The proposal is the deck's deliberately long message: it wraps inside its bubble.
export default {
  id: "exchange",
  layout: "full-bleed",
  title: "Asking before acting",
  elements: [
    { id: "chat", region: "main", type: "chat",
      props: { style: "bubbles", typing: true, shown: 1, messages: [
        { role: "user", label: "You", text: "Can you check whether the effect holds in **new** data?" },
        { role: "agent", label: "Agent", text: "Yes. I propose to hold out a fifth of the data, refit on the rest, and compare the error on both parts, repeated with three different seeds so the result is not luck. Shall I go ahead?" },
        { role: "user", label: "You", text: "Go ahead." },
      ] },
      advance: { prop: "shown", values: [1, 2, 3], start: "ask" } },
  ],
  steps: [{ id: "ask" }, { id: "propose" }, { id: "agree" }],
};
