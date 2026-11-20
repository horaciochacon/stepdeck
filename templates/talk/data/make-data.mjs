// Generates the synthetic example data: series.csv (two groups over ten years) and summary.json
// (the figures the slides show). Deterministic; rebuild both with `node data/make-data.mjs`.
//
// Group A rises steadily; Group B rises slowly until 2020, then three times as fast. Group B rows
// come first, so it takes the palette's first color, the accent the big number uses.
import { writeFileSync } from "node:fs";

const round1 = (v) => Math.round(v * 10) / 10;
const rows = [];
for (let year = 2015; year <= 2024; year++) {
  const t = year - 2015;
  rows.push({ year, group: "Group B", value: round1(year <= 2020 ? 22 + 0.9 * t : 26.5 + 2.7 * (year - 2020)) });
  rows.push({ year, group: "Group A", value: round1(24 + 1.1 * t) });
}

const here = new URL("./", import.meta.url);
const csv = ["year,group,value", ...rows.map((r) => `${r.year},${r.group},${r.value}`)];
writeFileSync(new URL("series.csv", here), `${csv.join("\n")}\n`);
const latest = (group) => rows.find((r) => r.group === group && r.year === 2024).value;
writeFileSync(new URL("summary.json", here), `${JSON.stringify({ latest_a: latest("Group A"), latest_b: latest("Group B") }, null, 2)}\n`);
