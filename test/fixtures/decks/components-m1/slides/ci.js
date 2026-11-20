// big-number with an interval, a prefix and a suffix; es uses the decimal comma and "IC 95%".
export default {
  id: "ci",
  layout: "full-bleed",
  elements: [
    { id: "rate", region: "main", type: "big-number", props: { value: 12.5, format: ".1f", suffix: " %", ci: [9.25, 15.75], label: "tasa" } },
  ],
};
