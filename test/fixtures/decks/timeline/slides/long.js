// Deliberately long labels and subs wrap inside their slot instead of overflowing, first and last included.
export default {
  id: "long",
  layout: "full-bleed",
  title: "Long",
  elements: [
    { id: "tl", region: "main", type: "timeline",
      props: { progress: 1, current: "b", stops: [
        { id: "a", label: "A deliberately long first label that has to wrap", sub: "and a long sub line under it as well" },
        { id: "b", label: "Middle", sub: "short" },
        { id: "c", label: "Also middle, but with a wordier label than most" },
        { id: "d", label: "Another extraordinarily long closing label to wrap", sub: "with an equally long sub line to wrap" },
      ] } },
  ],
};
