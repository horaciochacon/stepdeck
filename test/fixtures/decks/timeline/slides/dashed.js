// A dashed track: the unfilled part is dashed, the fill stays solid.
export default {
  id: "dashed",
  layout: "full-bleed",
  title: "Dashed",
  elements: [
    { id: "tl", region: "main", type: "timeline",
      props: { dashed: true, progress: 0.5, stops: [{ label: "Agent report" }, { label: "Our study" }, { label: "Paper" }] } },
  ],
};
