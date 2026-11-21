// Fixture: `chart.bar` re-sorts, in the modern theme. `resort` and `resort-vertical` re-order the bands by value, by a
// list and by another column while `y` changes; `resort-shown` re-sorts on the steps where a category appears or
// leaves. All data is synthetic. A slide that fails on purpose lives in bar-modes-broken, so this deck stays clean
// under `check --played`.
export default {
  title: "Bar modes fixture",
  lang: "en",
  theme: "modern",
  slides: ["resort", "resort-shown", "resort-vertical"],
};
