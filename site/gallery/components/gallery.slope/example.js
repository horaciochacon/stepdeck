// Example slide using `gallery.slope`: eight regions start level in 2010 (both ends show 2010), then the right end
// moves to 2020 and to 2030, each step tilting the lines and sliding the right labels to their new rank; the last
// step keeps one region in colour. Data: data/slope.csv relative to the deck root.
export default {
  id: "custom-slope",
  layout: "figure-notes",
  title: "Coastal climbed from seventh to first",
  elements: [
    { id: "slope", region: "main", type: "gallery.slope",
      props: { data: "data/slope.csv", category: "region", left: "y2010", right: "y2010", format: ".0%" } },
    { id: "note", region: "notes", type: "text",
      props: { role: "note", text: "Share of homes connected, by region. Each step moves the right end ten years on." } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "y2010" },
    { id: "y2020", set: { slope: { right: "y2020" } } },
    { id: "y2030", set: { slope: { right: "y2030" } } },
    { id: "highlight", only: { slope: { highlight: "Coastal" } } },
  ],
};
