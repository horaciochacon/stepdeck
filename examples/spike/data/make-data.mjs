// Generates the spike's synthetic dose–response data (dose-response.csv) and its summary (summary.json).
// Deterministic: no randomness, run `node examples/spike/data/make-data.mjs` to rebuild both files.
//
// responders(dose, regimen) = round(PARTICIPANTS * share), where share is a logistic curve in the dose
// (steepening above ~250 mg) plus a small linear term, so both series rise monotonically.
// rate = responders per 1,000 of the fixed synthetic PARTICIPANTS, one decimal.
// summary.responders = responders for combined at 500 mg (the last point of the steeper series).
import { writeFileSync } from "node:fs";

const PARTICIPANTS = 4800;
const REGIMENS = {
  single: { peak: 0.32, mid: 330, linear: 0.05 },
  combined: { peak: 0.55, mid: 300, linear: 0.07 },
};
const logistic = (dose, mid) => 1 / (1 + Math.exp(-(dose - mid) / 45));

const rows = [];
for (const [regimen, r] of Object.entries(REGIMENS)) {
  const base = logistic(0, r.mid);
  for (let dose = 0; dose <= 500; dose += 50) {
    const share = r.peak * (logistic(dose, r.mid) - base) + r.linear * (dose / 500);
    const responders = Math.round(PARTICIPANTS * share);
    rows.push({ dose_mg: dose, regimen, responders, rate: Math.round((responders / PARTICIPANTS) * 10000) / 10 });
  }
}

const here = new URL("./", import.meta.url);
const csv = ["dose_mg,regimen,responders,rate", ...rows.map((r) => `${r.dose_mg},${r.regimen},${r.responders},${r.rate}`)];
writeFileSync(new URL("dose-response.csv", here), `${csv.join("\n")}\n`);
const responders = rows.find((r) => r.regimen === "combined" && r.dose_mg === 500).responders;
writeFileSync(new URL("summary.json", here), `${JSON.stringify({ responders, participants: PARTICIPANTS }, null, 2)}\n`);
