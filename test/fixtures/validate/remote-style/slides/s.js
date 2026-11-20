// slide.style loading remote resources: neither may pass validate.
export default {
  id: "s", title: "Remote style",
  style: `
    .sd-canvas { background: url("https://example.org/bg.png") no-repeat; }
    h2 { background-image: url(//cdn.example.org/texture.png); }
  `,
  elements: [{ id: "lead", type: "text", props: { text: "Styled slide." } }],
};
