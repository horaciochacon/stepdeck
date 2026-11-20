// Five elements enter on step "go", 1000 ms apart (academic-light: --sd-duration 400ms). Three of them settle at or
// after 8000 ms: the card in slot 2 waits 2000 + 5000 ms and rises for 1200 ms (8200 ms); the list in slot 3 waits
// 3000 ms and builds six items 1000 ms apart, the last one rising for 400 ms (8400 ms); the number in slot 4 waits
// 4000 + 3200 ms and counts up for 2.25 x 400 ms (8100 ms). The first two cards settle well before.
export default {
  id: "s", title: "Motion budget",
  elements: [
    { id: "a", type: "text", props: { text: "One." }, from: "go" },
    { id: "b", type: "text", props: { text: "Two." }, from: "go" },
    { id: "c", type: "text", props: { text: "Three." }, from: "go", enter: { motion: "rise", delay: 5000, duration: 1200 } },
    { id: "tasks", type: "list", props: { marker: "number", items: [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }, { text: "E" }, { text: "F" }] }, from: "go" },
    { id: "n", type: "big-number", props: { value: 42, format: ",.0f", label: "items" }, from: "go", enter: { motion: "draw", delay: 3200 } },
    { id: "src", type: "text", props: { role: "source", text: "Synthetic content." } },
  ],
  steps: [{ id: "start" }, { id: "go", transition: { stagger: 1000 } }],
};
