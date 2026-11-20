// Deliberately broken (R6 fixture): update appends a line instead of rendering the state from props,
// so the result depends on the path taken to a step. `check --played` reports it as played-mismatch.
export default {
  mount(el) {
    const list = el.ownerDocument.createElement("div");
    list.className = "fixture-appender";
    // A fixed box, so the extra lines never move the elements below (one problem, not a cascade).
    Object.assign(list.style, { fontSize: "40px", height: "300px", overflow: "hidden" });
    el.appendChild(list);
    return {
      update(props) {
        const line = el.ownerDocument.createElement("div");
        line.textContent = `count ${props.count}`;
        list.appendChild(line);
      },
      destroy() {
        list.remove();
      },
    };
  },
};
