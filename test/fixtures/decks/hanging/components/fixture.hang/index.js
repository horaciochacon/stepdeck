// Deliberately faulty (R6 fixture): mounts fine, but update returns a promise that never settles.
export default {
  mount(el) {
    el.textContent = "hang";
    return { update: () => new Promise(() => {}), destroy() { el.textContent = ""; } };
  },
};
