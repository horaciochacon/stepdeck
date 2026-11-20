// Would shadow the built-in `text`; the registry must refuse it before importing it.
export default {
  mount(el) {
    el.textContent = "deck text";
    return { update() {} };
  },
};
