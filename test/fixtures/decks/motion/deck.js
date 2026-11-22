// Fixture: element box motion (every motion name, staggered entrances, a placed box, a collapse swap, an exit),
// ghost placeholders, and the entrances that charts, big-number, list, chat, diagram, terminal and timeline own
// (drawn in their stagger slot, `enter: "none"` and a box motion name), charts under a linear theme easing,
// the message line (lede) and text badges, in the modern theme. All content and data are synthetic.
export default {
  title: "Motion fixture",
  lang: "en",
  theme: "modern",
  slides: [
    "names", "cards", "boxed", "swap", "exit", "ghost",
    "chart-third", "chart-none", "chart-rise",
    "bar-third", "bar-none", "bar-rise", "bar-ease", "line-ease", "slow",
    "number-third", "number-none", "number-rise",
    "list-enters", "chat-enters",
    "diagram-enters", "terminal-enters", "timeline-enters",
    "lede", "badge",
  ],
};
