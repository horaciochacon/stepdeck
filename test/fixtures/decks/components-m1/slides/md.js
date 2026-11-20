// markdown: a localized color word, structure (heading, list, code), and raw HTML that must be escaped.
export default {
  id: "md",
  layout: "full-bleed",
  title: "Markdown",
  elements: [
    { id: "body", region: "main", type: "markdown", props: {
      md: "## Resultados\n\nLa serie en {{color:accent}} sube; la alerta va en {{color:alert}}.\n\n- **primero**: un punto\n- *segundo*: `código`\n\n[enlace malo](javascript:window.__pwned=1) y [enlace](#ok)\n\n[e1](&#106;avascript:window.__pwned=1) [e2](&#x6A;avascript:window.__pwned=1) [e3](java&#x09;script:window.__pwned=1) [e4](javascript&colon;window.__pwned=1) [e5](&Tab;javascript:window.__pwned=1)\n\n![i1](&#106;avascript:window.__pwned=1) ![i2](&#x6A;avascript:window.__pwned=1) ![i3](java&#x09;script:window.__pwned=1) ![i4](javascript&colon;window.__pwned=1) ![i5](&Tab;javascript:window.__pwned=1) ![ok](../../LICENSE)\n\n[mail](mailto:a@b.example) [rel](pics/x.html)\n\n<script>window.__pwned = 1</script> <img src=x onerror=\"window.__pwned=1\"> texto" } },
    { id: "more", region: "main", type: "markdown", from: "more", props: { md: "Aparece en el paso **more**." } },
  ],
  steps: [{ id: "start" }, { id: "more" }],
};
