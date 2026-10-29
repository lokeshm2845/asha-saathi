// Fills the PHC dashboard with synthetic demo visits from 3 other ASHAs, scored by the real engine.
// Usage (server running):  node tools/seed_demo.js [http://localhost:8000]
// All names are fictional demo data, not real patients.
const E = require("../web/shared/engine.js");
const SERVER = process.argv[2] || "http://localhost:8000";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();

const ASHAS = [
  { id: "ASHA-2101", name: "Mangala Bhil", village: "Wathode", people: [
    ["pregnant", "Lata Pawara", { age: 19, gestWeeks: 32, heightCm: 150 }, "आठ महीने, हीमोग्लोबिन 6.8, सांस फूलती है", 5],
    ["pregnant", "Sarika Bhil", { age: 26, gestWeeks: 22, heightCm: 156 }, "5 mahine, BP 112/72, Hb 11.4", 20],
    ["child", "Rohan (s/o Lata)", { ageMonths: 22 }, "MUAC 11.0 cm, pairon mein sujan", 3],
  ] },
  { id: "ASHA-2102", name: "Sangita Patil", village: "Arthe", people: [
    ["pregnant", "Manisha Koli", { age: 37, gestWeeks: 28, heightCm: 154, prevCsection: true }, "7 mahine, BP 128/84, Hb 9.6", 30],
    ["pregnant", "Jyoti Sonawane", { age: 23, gestWeeks: 36, heightCm: 158 }, "नऊ महिने, बाळाची हालचाल कमी, बीपी 120/80", 2],
    ["child", "Pari (d/o Jyoti)", { ageMonths: 14 }, "muac 12.1, dast", 26],
    ["child", "Om (s/o Manisha)", { ageMonths: 40 }, "MUAC 14.0, vajan 13 kg", 50],
  ] },
  { id: "ASHA-2103", name: "Rekha Valvi", village: "Holnanthe", people: [
    ["pregnant", "Kamal Valvi", { age: 21, gestWeeks: 16, heightCm: 143 }, "4 mahine, BP 110/70, Hb 10.2", 44],
    ["pregnant", "Priya Gavit", { age: 25, gestWeeks: 30, heightCm: 157 }, "7 mahine, BP 118/78, Hb 11.9, sab theek", 8],
  ] },
];

function payloads() {
  return ASHAS.map((a) => {
    const beneficiaries = [], visits = [];
    for (const [type, name, profile, text, hoursAgo] of a.people) {
      const b = { id: uid(), type, name, village: a.village, ...profile };
      const f = E.extract(text), r = E.assess(type, f, b);
      beneficiaries.push(b);
      visits.push({ id: uid(), beneficiaryId: b.id, createdAt: ago(hoursAgo), hoursAgo, transcript: text, fields: f, level: r.level, reasons: r.reasons, action: r.action });
    }
    return { asha: { id: a.id, name: a.name, village: a.village, phc: "Kharde Bk PHC (demo)" }, beneficiaries, visits };
  });
}

// `node tools/seed_demo.js --json backend/demo_seed.json` writes the payloads for the server's
// auto-seed (SEED_DEMO=1) instead of posting them.
if (process.argv[2] === "--json") {
  require("fs").writeFileSync(process.argv[3], JSON.stringify(payloads(), null, 1), "utf8");
  console.log("wrote", process.argv[3]);
} else {
  (async () => {
    for (const body of payloads()) {
      const res = await fetch(SERVER + "/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      console.log(body.asha.village, res.status, await res.text());
    }
  })();
}
