// A message line under the title: the lede sugar sits in the title region, and a step changes its text while
// it is on screen (the text crossfades).
export default {
  id: "lede",
  layout: "figure-notes",
  section: "Results",
  title: "Response by dose",
  lede: "Participants respond more as the dose rises.",
  elements: [
    { id: "figure", region: "main", type: "text", props: { text: "A figure stands here." } },
    { id: "note", region: "notes", type: "text", props: { role: "note", text: "A side note." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic content." } },
  ],
  steps: [
    { id: "start" },
    { id: "next", set: { lede: { text: "The line follows the step." } } },
  ],
};
