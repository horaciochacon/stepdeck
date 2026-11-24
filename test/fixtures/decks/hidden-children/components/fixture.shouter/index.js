// Test fixture: its one child writes inline `visibility: visible`, which would show through a hidden element box
// (visibility is inherited, and a descendant may override it) without the engine's rule for hidden elements.
export default {
  mount(el, props) {
    const p = el.ownerDocument.createElement("p");
    p.className = "fixture-shouter";
    p.style.visibility = "visible";
    el.appendChild(p);
    const render = (next) => { p.textContent = next.text; };
    render(props);
    return { update: render, destroy: () => p.remove() };
  },
};
