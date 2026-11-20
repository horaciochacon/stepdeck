// Deliberately faulty (R6 fixture): an image whose file does not exist (HTTP 404). The image
// failing to load raises no error in the runtime; only the request fails.
export default {
  mount(el) {
    const img = el.ownerDocument.createElement("img");
    img.alt = "";
    img.width = 10;
    img.height = 10;
    img.src = new URL("missing.png", import.meta.url).href;
    el.appendChild(img);
    return { update() {}, destroy() { img.remove(); } };
  },
};
