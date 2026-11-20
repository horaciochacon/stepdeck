// Example slide using `markdown`: a heading, a list with a localized color word, and a second block
// that appears at step "more". Raw HTML in `md` is shown as text.
export default {
  id: "markdown-example",
  layout: "full-bleed",
  title: "Markdown",
  elements: [
    { id: "lead", region: "main", type: "markdown",
      props: { md: "The **{{color:accent}}** line is the baseline.\n\n- Lists work.\n- So do *emphasis* and `code`." } },
    { id: "more", region: "main", type: "markdown", from: "more",
      props: { md: "This block appears at step **more**." } },
  ],
  steps: [{ id: "start" }, { id: "more" }],
};
