// Landing page: fills <ul id="gallery-list"> from the gallery deck's own list of slides, so the page
// cannot drift from the gallery. Every URL is relative to the page (it is served under /stepdeck/).
import { entries } from "./gallery/deck.js";

const GROUPS = [
  ["layout", "Layouts"],
  ["component", "Components"],
  ["motion", "Motion"],
  ["story", "Data stories"],
];

const list = document.getElementById("gallery-list");
list.replaceChildren(
  ...GROUPS.map(([kind, title]) => {
    const group = document.createElement("li");
    group.className = "gallery-group";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const items = document.createElement("ul");
    for (const e of entries.filter((x) => x.kind === kind)) {
      const li = document.createElement("li");
      const open = document.createElement("a");
      open.href = `site/gallery/#/${e.slide}/0`;
      open.textContent = e.name;
      const doc = document.createElement("a");
      doc.href = `site/docs/?p=${e.doc}`;
      doc.className = "doc-link";
      doc.textContent = "docs";
      li.append(open, doc);
      items.append(li);
    }
    group.append(heading, items);
    return group;
  }),
);
