// Deliberately broken (fixture): the line is forced visible with an inline `!important`, the one declaration that
// beats the engine's rule for the descendants of a hidden element. `check` reports it as hidden-paints.
export default {
  mount(el) {
    const line = el.ownerDocument.createElement("p");
    Object.assign(line.style, { margin: "0", fontSize: "40px" });
    line.style.setProperty("visibility", "visible", "important");
    el.appendChild(line);
    return {
      update(props) {
        line.textContent = props.text;
      },
      destroy() {
        line.remove();
      },
    };
  },
};
