// Deliberately faulty (R6 fixture): logs a console error at mount, renders nothing else.
export default {
  mount() {
    console.error("fixture: something went wrong");
    return { update() {}, destroy() {} };
  },
};
