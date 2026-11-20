// Motion gallery: the message line and a badge. The slide's `lede` changes on every step and crossfades; the badge
// above the title flips from "Data" to "Forecast" when the forecast line draws in, with the same crossfade, and its
// colour fades from the observed line's colour (tone 0) to the forecast line's (tone 1): a badge's `tone` is an
// index into the categorical palette, and the chart colours its series in the same order. The pill's border takes
// the palette colour and its text the same colour darkened to 4.5:1, so any tone reads in either theme. The title
// is an explicit element so the badge can sit above it. Data: data/motion-forecast.csv.
export default {
  id: "motion-message",
  layout: "full-bleed",
  lede: "Twelve weeks of observed sign-ups, rising every week.",
  elements: [
    { id: "status", region: "title", type: "text", props: { role: "badge", tone: 0, text: "Data" } },
    { id: "title", region: "title", type: "text", props: { text: "Twelve weeks, then six more" } },
    { id: "chart", region: "main", type: "chart.line",
      props: { data: "data/motion-forecast.csv", x: "week", y: "signups", series: "series", series_shown: ["Observed"],
               axes: { x: "Week", y: "Sign-ups per week" }, format: { x: "d", y: ",.0f" } } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "observed" },
    { id: "forecast",
      set: { chart: { series_shown: ["Observed", "Forecast"] }, status: { tone: 1, text: "Forecast" },
             lede: { text: "The forecast carries the trend six weeks further." } } },
    { id: "today",
      set: { chart: { annotate: [{ x: 12, label: "Today" }] },
             lede: { text: "Growth slows after today, but it does not stop." } } },
  ],
  notes: "The lede crossfades on every step; the badge flips its text and colour with the same crossfade. Reference: docs/guide/animation-and-motion.md",
};
