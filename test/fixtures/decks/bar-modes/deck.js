// Fixture: `chart.bar` modes and re-sorts, in the modern theme. `resort` and `resort-vertical` re-order the bands by
// value, by a list and by another column while `y` changes; `resort-shown` re-sorts on the steps where a category appears
// or leaves. The waterfall slides add up the bars on screen (`waterfall`: a category appears, the total fades in, `y`
// changes; `waterfall-sort`; `waterfall-invert`; `waterfall-vertical`; `waterfall-enter`, which grows in on a step; `waterfall-floor` and
// `waterfall-below`, whose labels sit under the plot), and `mode-switch` (with `-vertical` and `-swing`) morphs bars
// into a waterfall and back in one frame. All data is synthetic. Slides that fail on purpose live in bar-modes-broken, so this deck stays clean under
// `check --played`.
export default {
  title: "Bar modes fixture",
  lang: "en",
  theme: "modern",
  slides: ["resort", "resort-shown", "resort-vertical", "waterfall", "waterfall-sort", "waterfall-invert", "waterfall-vertical", "waterfall-enter", "waterfall-floor", "waterfall-below", "mode-switch", "mode-switch-vertical", "mode-switch-swing"],
};
