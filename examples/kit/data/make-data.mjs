// Generates the kit deck's synthetic data. Deterministic: no randomness; run
// `node examples/kit/data/make-data.mjs` to rebuild every file it writes.
//
// speed.csv: days per task, before and with an agent (one unit, two columns; the slide switches `y`).
//   before_days = hours of work / HOURS_PER_DAY, rounded; agent_days = before_days * the task's share
//   left once an agent does the routine part, rounded up to whole days.
// estimate.csv: the outcome per 100 people in two synthetic groups, with a 95% interval from the
//   normal approximation to the binomial (p ± 1.96 · sqrt(p(1 - p) / n)).
import { writeFileSync } from "node:fs";

const here = new URL("./", import.meta.url);
const write = (name, header, rows) =>
  writeFileSync(new URL(name, here), `${[header.join(","), ...rows.map((r) => header.map((h) => r[h]).join(","))].join("\n")}\n`);

const HOURS_PER_DAY = 6;
const TASKS = [
  { task: "Clean the data", hours: 150, left: 0.12 },
  { task: "Write the report", hours: 108, left: 0.15 },
];
write("speed.csv", ["task", "before_days", "agent_days"], TASKS.map((t) => {
  const before = Math.round(t.hours / HOURS_PER_DAY);
  return { task: t.task, before_days: before, agent_days: Math.ceil(before * t.left) };
}));

const GROUPS = [
  { group: "Less exposed", n: 1200, cases: 102 },
  { group: "More exposed", n: 1150, cases: 184 },
];
const r1 = (v) => Math.round(v * 10) / 10;
write("estimate.csv", ["group", "per100", "low", "high"], GROUPS.map((g) => {
  const p = g.cases / g.n;
  const half = 1.96 * Math.sqrt((p * (1 - p)) / g.n);
  return { group: g.group, per100: r1(100 * p), low: r1(100 * (p - half)), high: r1(100 * (p + half)) };
}));
