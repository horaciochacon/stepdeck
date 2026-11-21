// Fixture: points and a forecast segment on chart.line, in the modern theme. `forecast` builds the chart
// over several steps (none -> points -> forecast -> label -> exact); `points` adds series and morphs y with
// the markers on; `forecast-early` and `forecast-late` put `forecast.from` outside the data. All data is synthetic.
export default {
  title: "Line story fixture",
  lang: "en",
  theme: "modern",
  slides: ["forecast", "points", "forecast-early", "forecast-late"],
};
