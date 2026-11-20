// `halves`: the prompt as a `chat` card on the left, a checklist `list` on the right that ticks one item
// per step through `advance` on `done`. Every item is visible from the start; only `done` changes.
export default {
  id: "tasks",
  layout: "halves",
  title: "One prompt, four tasks",
  regions: { "--gutter": "96px", "--align": "center" },
  elements: [
    { id: "prompt", region: "left", type: "chat",
      props: { style: "card", messages: [
        { role: "user", label: "The prompt", text: "Check the survey data, fit the model, make the two figures and write a **one-page** summary." },
        { role: "note", label: "The rule", text: "Work only inside the project folder. Never change `data/raw/`." },
      ] } },
    { id: "todo", region: "right", type: "list",
      props: { marker: "check", done: 0, items: [
        { id: "check", text: "Check the data", sub: "missing values, duplicates" },
        { id: "fit", text: "Fit the model", sub: "with its 95% interval" },
        { id: "figures", text: "Make the figures", sub: "saved in `figures/`" },
        { id: "summary", text: "Write the summary", sub: "one page, plain words" },
      ] },
      advance: { prop: "done", values: [0, 1, 2, 3, 4], start: "prompt" } },
  ],
  steps: [{ id: "prompt" }, { id: "checked" }, { id: "fitted" }, { id: "drawn" }, { id: "written" }],
};
