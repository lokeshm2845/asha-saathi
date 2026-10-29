// Rule-consistency evaluation of the ASHA Saathi engine on a fixed set of synthetic visit notes.
// The expected level of each case was written from the MoHFW / Anemia Mukt Bharat / MUAC cut-offs,
// not copied from engine output. This is NOT clinical validation (that needs doctor-labelled real cases).
// Usage: node tools/evaluate.js [out.csv]
const fs = require("fs");
const E = require("../web/shared/engine.js");

const P = "pregnant", C = "child";
const CASES = [
  // [type, note, profile, expected]
  [P, "saat mahine, pairon mein sujan, do din se sir dard, BP 150/100", {}, "RED"],
  [P, "सात महिने, पायांवर सूज, डोकं दुखतंय, बीपी 150/100", {}, "RED"],
  [P, "सात महीने की गर्भवती, बीपी 145 बटा 95, सिर दर्द", {}, "RED"],
  [P, "8 mahine, BP 165/112", {}, "RED"],
  [P, "6 mahine, BP 142/92, koi taklif nahi", {}, "RED"],
  [P, "5 mahine, hb 6.5", {}, "RED"],
  [P, "आठ महीने, हीमोग्लोबिन 6.8, सांस फूलती है", {}, "RED"],
  [P, "9 mahine, khoon aa raha hai", {}, "RED"],
  [P, "4 mahine, bleeding ho rahi hai, pet dard", {}, "RED"],
  [P, "8 mahine, kal raat daura aaya", {}, "RED"],
  [P, "7 mahine, tez sir dard aur dhundhla dikh raha hai", {}, "RED"],
  [P, "8 mahine, bachcha kam hil raha hai", {}, "RED"],
  [P, "नऊ महिने, बाळाची हालचाल कमी, बीपी 120/80", {}, "RED"],
  [P, "9 mahine, pani gir raha hai", {}, "RED"],
  [P, "32 weeks, BP 150/96, Hb 10.5", {}, "RED"],
  [P, "6 mahine, hb 8.5, saans phool rahi hai", {}, "RED"],
  [P, "5 mahine, hemoglobin 8.4, BP 110/70", {}, "AMBER"],
  [P, "6 mahine, Hb 9.2, BP 118/76", {}, "AMBER"],
  [P, "4 mahine, BP 110/70, Hb 11.2", { age: 17 }, "AMBER"],
  [P, "7 mahine, BP 120/80, Hb 11.0", { age: 38 }, "AMBER"],
  [P, "8 mahine, BP 116/74, Hb 11.6", { heightCm: 142 }, "AMBER"],
  [P, "7 mahine, BP 122/80, Hb 11.4", { prevCsection: true }, "AMBER"],
  [P, "6 mahine, BP 118/78, Hb 11.5", { twins: true }, "AMBER"],
  [P, "5 mahine, bukhar hai do din se, BP 110/70", {}, "AMBER"],
  [P, "7 mahine, pairon mein sujan, BP 128/84", {}, "AMBER"],
  [P, "6 mahine, sir dard, BP 124/80", {}, "AMBER"],
  [P, "5 mahine, pet me dard, BP 112/72, Hb 11", {}, "AMBER"],
  [P, "8 mahine, BP 118/76, Hb 11.8, sab theek", {}, "GREEN"],
  [P, "6 mahine, sujan nahi hai, BP 110/70, Hb 11.5", {}, "GREEN"],
  [P, "5 mahine, BP 112/70, Hb 10.6", {}, "GREEN"],
  [P, "32 weeks, BP 120/80, Hb 12.1", {}, "GREEN"],
  [P, "सहा महिने, बीपी 118/76, एचबी 11.9", {}, "GREEN"],
  [P, "4 mahine, BP 108/68, Hb 12, bukhar nahi", {}, "GREEN"],
  [C, "MUAC 11.2 cm, vajan 7 kg", { ageMonths: 18 }, "RED"],
  [C, "MUAC 115 mm, khana kam", { ageMonths: 24 }, "AMBER"],
  [C, "muac 10.8, pairon mein sujan", { ageMonths: 20 }, "RED"],
  [C, "bachcha doodh nahi pi raha, bukhar", { ageMonths: 3 }, "RED"],
  [C, "bachcha sust hai, behosh jaisa", { ageMonths: 14 }, "RED"],
  [C, "tez saans, pasli chal rahi hai, muac 13", { ageMonths: 10 }, "RED"],
  [C, "bukhar hai", { ageMonths: 1 }, "RED"],
  [C, "muac 12.0", { ageMonths: 18 }, "AMBER"],
  [C, "dast ho rahe hain, MUAC 13.1", { ageMonths: 20 }, "AMBER"],
  [C, "bukhar do din se, muac 13.4", { ageMonths: 30 }, "AMBER"],
  [C, "ulti ho rahi hai, muac 13.0", { ageMonths: 16 }, "AMBER"],
  [C, "muac 13.5, khana kha raha hai", { ageMonths: 18 }, "GREEN"],
  [C, "MUAC 14.0, vajan 13 kg", { ageMonths: 40 }, "GREEN"],
  [C, "muac 13.8, bukhar nahi, dast nahi", { ageMonths: 22 }, "GREEN"],
  [C, "vajan 9.5 kg, MUAC 13.6", { ageMonths: 15 }, "GREEN"],
];

const LV = ["RED", "AMBER", "GREEN"];
const cm = Object.fromEntries(LV.map((a) => [a, Object.fromEntries(LV.map((b) => [b, 0]))]));
const rows = [["#", "type", "note", "profile", "expected", "engine", "match"]];
let ok = 0;
CASES.forEach(([type, note, prof, exp], i) => {
  const got = E.assess(type, E.extract(note), prof).level;
  cm[exp][got]++; if (got === exp) ok++;
  rows.push([i + 1, type, note, JSON.stringify(prof), exp, got, got === exp ? "yes" : "NO"]);
});
const N = CASES.length;
const red = cm.RED, redTotal = LV.reduce((s, l) => s + red[l], 0);
const flagged = (l) => cm[l].RED + cm[l].AMBER;
const t0 = process.hrtime.bigint(); const LOOPS = 20000;
for (let i = 0; i < LOOPS; i++) { const [t, n, p] = CASES[i % N]; E.assess(t, E.extract(n), p); }
const msPer = Number(process.hrtime.bigint() - t0) / 1e6 / LOOPS;

console.log(`Cases: ${N} (pregnancy ${CASES.filter((c) => c[0] === P).length}, child ${CASES.filter((c) => c[0] === C).length})`);
console.log(`Exact level agreement: ${ok}/${N} = ${(100 * ok / N).toFixed(1)}%`);
console.log(`RED sensitivity (RED cases flagged RED): ${red.RED}/${redTotal} = ${(100 * red.RED / redTotal).toFixed(1)}%`);
console.log(`RED cases missed entirely (engine said GREEN): ${red.GREEN}`);
console.log(`AMBER cases flagged (RED or AMBER): ${flagged("AMBER")}/${LV.reduce((s, l) => s + cm.AMBER[l], 0)}`);
console.log("Confusion matrix (rows = expected, cols = engine):");
console.log("        RED  AMBER  GREEN"); LV.forEach((l) => console.log(`${l.padEnd(6)} ${String(cm[l].RED).padStart(4)} ${String(cm[l].AMBER).padStart(6)} ${String(cm[l].GREEN).padStart(6)}`));
console.log(`Speed: ${msPer.toFixed(3)} ms per visit (extract + assess, ${LOOPS} runs, Node ${process.version})`);
rows.filter((r) => r[6] === "NO").forEach((r) => console.log("MISMATCH:", r.join(" | ")));
if (process.argv[2]) fs.writeFileSync(process.argv[2], rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n"), "utf8");
