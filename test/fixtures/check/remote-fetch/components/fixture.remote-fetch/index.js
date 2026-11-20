// Deliberately faulty (R6 fixture): fetches a remote URL at mount. The failure is swallowed, so the
// runtime records nothing; only the blocked request shows.
export default {
  async mount() {
    await fetch("https://stepdeck-remote.invalid/data.json").catch(() => {});
    return { update() {} };
  },
};
