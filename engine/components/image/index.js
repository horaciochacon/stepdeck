// Built-in `image`: a local image with alt text, a fit mode and an optional caption.
//
// The element is a <figure> with an <img> that fills the box (object-fit from `fit`) and a <figcaption> under
// it when there is a caption. `src` is a deck-relative path; ctx.assetUrl resolves it against the deck root
// with the data-path rules, so a remote URL or a path that leaves the deck is an error naming it.
//
// update() writes the state straight into the DOM, then waits for the image (`img.decode()`), so the engine's
// settled() covers the load. A file that is missing or not a decodable image rejects, which is an element
// error naming the path. With info.animate a new `src` fades in once loaded and a changed caption fades in,
// timed by the theme; an element that appears is moved by its box, not by itself. The motion is bound to
// info.signal (an abort snaps to the end state) and the inline styles it used are removed, so the html is the
// same however a state was reached.
import { renderInline } from "../../core/inline.js";
import { clearInlineStyle } from "../../core/animate.js";
import { motion } from "../../core/kit.js";

const FITS = ["contain", "cover"];

export default {
  mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const figure = doc.createElement("figure");
    figure.className = "sd-image";
    const img = doc.createElement("img");
    img.className = "sd-image-img";
    figure.appendChild(img);
    el.appendChild(figure);
    let caption = null; // the <figcaption>, present only while there is a caption
    let captionText = ""; // the markdown it shows

    /** Validates the props; returns what to draw. */
    function read(props) {
      const src = props?.src;
      if (typeof src !== "string" || src === "") throw new Error("image needs a `src`: a path to an image file in the deck");
      const alt = props.alt;
      if (typeof alt !== "string" || alt.trim() === "") throw new Error("image needs non-empty `alt` text describing the picture");
      const fit = props.fit ?? "contain";
      if (!FITS.includes(fit)) throw new Error(`image \`fit\` must be one of ${FITS.map((f) => `'${f}'`).join(", ")}, got ${JSON.stringify(fit)}`);
      const text = props.caption == null ? "" : String(props.caption);
      if (typeof ctx.assetUrl !== "function") throw new Error("image: this engine has no ctx.assetUrl to resolve `src`");
      let url;
      try {
        url = ctx.assetUrl(src);
      } catch (e) {
        throw new Error(`image \`src\` '${src}': ${e.message}`);
      }
      return { src, url, alt, fit, text };
    }

    /** Writes the state; returns what changed. */
    function render(s) {
      const srcChanged = img.getAttribute("src") !== s.url;
      img.setAttribute("alt", s.alt);
      figure.setAttribute("data-fit", s.fit);
      if (srcChanged) img.setAttribute("src", s.url);
      const captionChanged = captionText !== s.text;
      if (captionChanged) {
        captionText = s.text;
        if (s.text === "") {
          caption?.remove();
          caption = null;
        } else {
          if (!caption) {
            caption = doc.createElement("figcaption");
            caption.className = "sd-image-caption";
            figure.appendChild(caption);
          }
          caption.innerHTML = renderInline(s.text);
        }
      }
      return { srcChanged, captionChanged: captionChanged && s.text !== "" };
    }

    /** No inline style survives an update. */
    function clearInline() {
      clearInlineStyle(figure, img, caption);
    }

    // Nothing is rendered at mount: the engine's first update is a full render, and starting a load for the
    // step-0 `src` here would abort it (a failed request) when the first state to show is a later step.
    return {
      async update(props, info = {}) {
        const s = read(props);
        const changed = render(s);
        try {
          try {
            await img.decode();
          } catch (cause) {
            throw new Error(`image '${s.src}' could not be loaded: the file is missing or is not a decodable image (${s.url})`, { cause });
          }
          if (info.animate !== true || info.signal?.aborted) return;
          if (info.entered) return; // the box carries the entrance
          const opts = motion(info, ctx);
          const motions = [];
          if (changed.srcChanged) motions.push(ctx.animate.fadeIn(img, opts));
          if (changed.captionChanged && caption) motions.push(ctx.animate.fadeIn(caption, opts));
          await Promise.all(motions);
        } finally {
          clearInline();
        }
      },
      destroy() {
        figure.remove();
      },
    };
  },
};
