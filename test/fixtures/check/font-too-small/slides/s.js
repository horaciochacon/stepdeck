// One body paragraph styled below the 28 px audience minimum. The source line and the footer text
// are just as small but exempt (the footer frame), so they must not be reported.
export default {
  id: "s",
  layout: "figure-notes",
  style: ".sd-text { font-size: 20px; }",
  elements: [
    { id: "small", region: "main", type: "text", props: { text: "Too small for the audience." } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Source: synthetic." } },
    { id: "foot", region: "footer", type: "text", props: { text: "Footer line." } },
  ],
};
