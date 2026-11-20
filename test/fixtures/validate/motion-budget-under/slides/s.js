// The motion-budget fixture with each late element a little earlier: all five settle before 8000 ms. The card in
// slot 2 waits 2000 + 4700 ms and rises for 1200 ms (7900 ms); the list in slot 3 builds five items (7400 ms); the
// number in slot 4 waits 4000 + 3000 ms and counts up for 900 ms (7900 ms).
export default {
  id: "s", title: "Motion budget",
  elements: [
    { id: "a", type: "text", props: { text: "One." }, from: "go" },
    { id: "b", type: "text", props: { text: "Two." }, from: "go" },
    { id: "c", type: "text", props: { text: "Three." }, from: "go", enter: { motion: "rise", delay: 4700, duration: 1200 } },
    { id: "tasks", type: "list", props: { marker: "number", items: [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }, { text: "E" }] }, from: "go" },
    { id: "n", type: "big-number", props: { value: 42, format: ",.0f", label: "items" }, from: "go", enter: { motion: "draw", delay: 3000 } },
    { id: "src", type: "text", props: { role: "source", text: "Synthetic content." } },
  ],
  steps: [{ id: "start" }, { id: "go", transition: { stagger: 1000 } }],
};
