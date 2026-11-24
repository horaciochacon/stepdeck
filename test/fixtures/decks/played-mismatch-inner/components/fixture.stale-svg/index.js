// Deliberately broken (fixture): the <svg> is sized on the first update only, so its size depends on the step the
// page was loaded at. The wrapper has a fixed size, so the element's box never changes: only the figure inside it
// differs, which `check --played` reports as played-mismatch (inner).
export default {
  mount(el) {
    const doc = el.ownerDocument;
    const frame = doc.createElement("div");
    Object.assign(frame.style, { width: "800px", height: "200px" });
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("height", "200");
    frame.appendChild(svg);
    el.appendChild(frame);
    let sized = false;
    return {
      update(props) {
        if (sized) return;
        svg.setAttribute("width", String(props.width));
        sized = true;
      },
      destroy() {
        frame.remove();
      },
    };
  },
};
