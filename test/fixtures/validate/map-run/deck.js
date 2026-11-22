// Fixture: a time-lapse run against the 20 s ceiling. `long` moves 29 frames at the default 700 ms (20.3 s); `flight` moves 28 (19.6 s) while the map flies, which adds 2 x --sd-duration; `plain` makes the same 28 moves without a flight, and is clean. The files come from make.mjs.
export default {
  title: "validate fixture: map-run",
  lang: "en",
  theme: "academic-light",
  slides: ["long", "flight", "plain"],
};
