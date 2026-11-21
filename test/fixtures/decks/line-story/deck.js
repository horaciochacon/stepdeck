// Fixture: points and a forecast segment on chart.line, in the modern theme. `forecast` builds the chart
// over several steps (none -> points -> forecast -> label -> exact); `points` adds series and morphs y with
// the markers on; `forecast-early` and `forecast-late` put `forecast.from` outside the data; `sweep` and `story` sweep
// `until` with a ticker (alone, and into the forecast); `clash` has a label where the ticker is; `fan` raises and lowers the
// number of uncertainty draws and `fan-sweep` adds them to a sweep with a highlight; `single` is one
// line without `series`; `blank` has a blank-looking cell, which is missing. All data is synthetic. A slide that
// fails on purpose lives in line-story-broken, so this deck stays clean under `check --played`.
export default {
  title: "Line story fixture",
  lang: "en",
  theme: "modern",
  slides: ["forecast", "points", "forecast-early", "forecast-late", "sweep", "story", "clash", "fan", "fan-sweep", "single", "blank"],
};
