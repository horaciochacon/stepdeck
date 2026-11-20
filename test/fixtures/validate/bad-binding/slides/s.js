// bindings to a missing file, a missing pointer and a bad format.
export default {
  id: "s", title: "Bad bindings",
  elements: [
    { id: "nofile", type: "text", props: { text: "{{data/nope.json#/n}}" } },
    { id: "nopointer", type: "text", props: { text: "About {{data/summary.json#/total | ,.0f}} people." } },
    { id: "badformat", type: "text", props: { text: "{{data/summary.json#/n | zz}}" } },
  ],
};
