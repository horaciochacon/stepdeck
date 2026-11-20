// Stops placed with `at`, not evenly: the fill passes the first two but not the third.
export default {
  id: "spaced",
  layout: "full-bleed",
  title: "Spaced",
  elements: [
    { id: "tl", region: "main", type: "timeline",
      props: { progress: 0.4, stops: [
        { id: "a", label: "Start", at: 0 },
        { id: "b", label: "Soon", at: 0.2 },
        { id: "c", label: "Later", at: 0.4 },
        { id: "d", label: "End", at: 1 },
      ] } },
  ],
};
