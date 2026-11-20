// The cover, on the `title` layout: a kicker (the `section`), the title with one accent phrase (`*…*`), subtitle,
// meta and a footer line. No steps.
export default {
  id: "title",
  layout: "title",
  section: "Event name",
  title: "Your *talk title*",
  elements: [
    { id: "subtitle", region: "subtitle", type: "text", props: { text: "A subtitle that says what the audience will take away" } },
    { id: "meta", region: "meta", type: "text", props: { text: "Author name · Affiliation · Date" } },
    { id: "footer", region: "footer", type: "text", props: { role: "source", text: "Made with stepdeck" } },
  ],
};
