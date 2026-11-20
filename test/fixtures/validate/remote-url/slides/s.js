// props with a remote URL and a protocol-relative URL (R20).
export default {
  id: "s", title: "Remote URL",
  elements: [
    { id: "link", type: "text", props: { text: "Read more at https://example.org/report." } },
    { id: "img", type: "markdown", props: { md: "![logo](//cdn.example.org/logo.png)" } },
  ],
};
