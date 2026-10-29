// Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const E = require("../web/shared/engine.js");

const run = (type, text, profile) => { const f = E.extract(text); return { f, r: E.assess(type, f, profile) }; };

test("Hinglish pre-eclampsia example is RED", () => {
  const { f, r } = run("pregnant", "Sunita, saat mahine ki garbhvati, pairon mein sujan, do din se sir dard, BP 150/100");
  assert.equal(f.bpSys, 150); assert.equal(f.bpDia, 100); assert.equal(f.months, 7);
  assert.ok(f.swelling && f.headache);
  assert.equal(r.level, "RED");
  assert.ok(r.reasons.some((x) => x.code === "BP_HIGH" && /pre-eclampsia/.test(x.en)));
});

test("Devanagari Hindi with Hindi digits and 'बटा'", () => {
  const { f, r } = run("pregnant", "सात महीने की गर्भवती, बीपी १४५ बटा ९५, सिर दर्द");
  assert.equal(f.bpSys, 145); assert.equal(f.bpDia, 95); assert.equal(f.months, 7);
  assert.equal(r.level, "RED");
});

test("Severe anaemia from Hb is RED, moderate is AMBER", () => {
  assert.equal(run("pregnant", "5 mahine, hb 6.5").r.level, "RED");
  assert.equal(run("pregnant", "5 mahine, hemoglobin 8.4, BP 110/70").r.level, "AMBER");
});

test("Negation: 'sujan nahi' is not swelling", () => {
  const { f, r } = run("pregnant", "6 mahine, sujan nahi hai, BP 110/70, Hb 11.5");
  assert.ok(!f.swelling);
  assert.equal(r.level, "GREEN");
});

test("Normal visit is GREEN, profile risk raises to AMBER", () => {
  assert.equal(run("pregnant", "8 mahine, BP 118/76, Hb 11.8, sab theek").r.level, "GREEN");
  assert.equal(run("pregnant", "8 mahine, BP 118/76, Hb 11.8", { age: 17 }).r.level, "AMBER");
});

test("Bleeding and reduced fetal movement are RED", () => {
  assert.equal(run("pregnant", "9 mahine, khoon aa raha hai").r.level, "RED");
  assert.equal(run("pregnant", "8 mahine, bachcha kam hil raha hai").r.level, "RED");
});

test("Child MUAC thresholds", () => {
  assert.equal(run("child", "MUAC 11.2 cm, vajan 7 kg", { ageMonths: 18 }).r.level, "RED");
  assert.equal(run("child", "muac 12.0", { ageMonths: 18 }).r.level, "AMBER");
  assert.equal(run("child", "muac 13.5, khana kha raha hai", { ageMonths: 18 }).r.level, "GREEN");
  assert.equal(run("child", "MUAC 115 mm", { ageMonths: 18 }).f.muacCm, 11.5);
});

test("Child danger signs", () => {
  assert.equal(run("child", "bachcha doodh nahi pi raha, bukhar", { ageMonths: 3 }).r.level, "RED");
  assert.equal(run("child", "dast ho rahe hain, muac 13", { ageMonths: 20 }).r.level, "AMBER");
});

test("Weeks parsed directly", () => {
  assert.equal(run("pregnant", "32 weeks, BP 120/80").f.gestWeeks, 32);
});

test("Marathi visit note is parsed", () => {
  const { f, r } = run("pregnant", "सात महिने, पायांवर सूज, दोन दिवसांपासून डोकं दुखतंय, बीपी 150/100");
  assert.equal(f.months, 7); assert.ok(f.swelling && f.headache); assert.equal(f.bpSys, 150);
  assert.equal(r.level, "RED");
  assert.equal(run("pregnant", "नऊ महिने, बाळाची हालचाल कमी, बीपी 120/80").r.level, "RED");
});
