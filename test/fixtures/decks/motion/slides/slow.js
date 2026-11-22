// A bar chart whose second step moves its bars over three seconds: long enough to hide the page in the middle of
// the move. Its end state is the one a jump shows.
export default {
  id: "slow",
  layout: "full-bleed",
  title: "A slow move",
  elements: [
    { id: "bars", region: "main", type: "chart.bar",
      props: { data: "data/groups.csv", x: "group", y: "low", domain: [0, 30], axes: { y: "Count" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [{ id: "low" }, { id: "high", set: { bars: { y: "high" } }, transition: { duration: 3000 } }],
};
