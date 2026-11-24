// A collapsed timeline (`display: none` until step `show`) whose `stops` change on an earlier step: it is
// rebuilt while it has no size, and must be measured again once it shows.
const stops = (label) => [
  { id: "draft", label, sub: "week 1" },
  { id: "review", label: "Review" },
  { id: "final", label: "Final", sub: "week 4" },
];
export default {
  id: "collapsed",
  layout: "full-bleed",
  title: "Collapsed until shown",
  elements: [
    { id: "tl", region: "main", type: "timeline", from: "show", collapse: true,
      props: { progress: 0.5, current: "review", stops: stops("First draft") } },
    { id: "after", region: "main", type: "text", props: { text: "A line under the timeline." } },
  ],
  steps: [
    { id: "start" },
    { id: "rename", set: { tl: { stops: stops("Outline") } } },
    { id: "show" },
  ],
};
