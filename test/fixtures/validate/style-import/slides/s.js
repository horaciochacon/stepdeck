// slide.style with a local @import: CSSStyleSheet.replaceSync ignores it, so it must not pass validate.
export default {
  id: "s", title: "Style import",
  style: `@import "extra.css";
    h2 { letter-spacing: 0.02em; }`,
  elements: [{ id: "lead", type: "text", props: { text: "Styled slide." } }],
};
