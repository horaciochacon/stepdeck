// fixture.mapchild: the built-in `map`, mounted with ctx.mount inside this element. A child has no `ctx.stepProps`, so
// it cannot know the whole slide's steps: this is how the tests reach the map's choices for that case. `map` is the
// child's props and `frame` its frame (a prop of its own, so a step can change it alone); every update passes both on.
export default {
  async mount(el, props, ctx) {
    const box = el.appendChild(el.ownerDocument.createElement("div"));
    box.style.width = "100%";
    box.style.height = "100%";
    const child = await ctx.mount("map", box, { ...props.map, frame: props.frame });
    return {
      update: (next, info) => child.update({ ...next.map, frame: next.frame }, info),
    };
  },
};
