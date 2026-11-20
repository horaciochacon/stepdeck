// Deliberately faulty (R6 fixture): mount throws, so the runtime records a render error and shows
// it in place of the element.
export default {
  mount() {
    throw new Error("fixture: mount failed");
  },
};
