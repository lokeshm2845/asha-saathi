/*
 * ASHA Saathi risk engine.
 * 1) extract(): turns a spoken/typed visit note (Hindi, Hinglish, Marathi keywords or English)
 *    into structured fields.
 * 2) assess(): applies danger-sign rules (MoHFW ANC/HRP guidance, Anemia Mukt Bharat,
 *    MUAC cut-offs) and returns RED / AMBER / GREEN with reasons in Hindi + English.
 * Runs fully offline in the browser and in Node (for tests).
 * Decision support only: the ANM / Medical Officer makes the final decision.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AshaEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEV_DIGITS = { "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9" };
  // Number words that commonly appear before "mahine" / "hafte" / "saal".
  const NUM_WORDS = {
    ek: 1, do: 2, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5, chhe: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10,
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
    "सहा": 6, "आठवा": 8, "नऊ": 9, "पाच": 5,
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };

  function normalise(text) {
    let t = String(text || "").toLowerCase();
    t = t.replace(/[०-९]/g, (d) => DEV_DIGITS[d]);
    t = t.replace(/[,;:!?।]/g, " ").replace(/\s+/g, " ").trim();
    return t;
  }

  function numBefore(t, unitPattern) {
    const re = new RegExp("(\\d+(?:\\.\\d+)?|[a-z\\u0900-\\u097f]+)\\s*(?:" + unitPattern + ")");
    const m = t.match(re);
    if (!m) return null;
    const v = /^\d/.test(m[1]) ? parseFloat(m[1]) : NUM_WORDS[m[1]];
    return v === undefined ? null : v;
  }

  const NEG = "(?:\\s*(?:nahi|nahin|nhi|नहीं|नही|नाही|no|not|absent))";

  // keyword lists per finding; a match followed by a negation word ("sujan nahi") is ignored.
  const SIGNS = {
    swelling: ["sujan", "soojan", "sooja", "सूजन", "सूज", "swelling", "oedema", "edema"],
    headache: ["sir dard", "sar dard", "sirdard", "सिर दर्द", "सिरदर्द", "डोकेदुखी", "डोकं दुख", "डोके दुख", "headache"],
    blurredVision: ["dhundhla", "dhundla", "धुंधला", "kam dikh", "कम दिख", "धूसर", "blurred", "blurry", "blurring"],
    bleeding: ["khoon aa", "khoon beh", "khoon ja", "khun aa", "bleeding", "रक्तस्राव", "रक्त जा", "खून आ", "खून बह", "खून जा", "रक्तस्त्राव"],
    fits: ["daura", "दौरा", "jhatke", "झटके", "fits", "convulsion", "seizure", "आकडी"],
    reducedMovement: ["kam hil", "कम हिल", "hilna kam", "हिलना कम", "movement kam", "reduced movement", "less movement", "बाळाची हालचाल कमी"],
    fever: ["bukhar", "bukhaar", "बुखार", "ताप", "fever"],
    breathless: ["saans phool", "saans fool", "sans phool", "सांस फूल", "साँस फूल", "breathless", "shortness of breath", "dam phool"],
    abdominalPain: ["pet dard", "pet me dard", "पेट दर्द", "पेट में दर्द", "पोटदुखी", "abdominal pain", "stomach pain"],
    leakingWater: ["pani gir", "paani gir", "पानी गिर", "पानी जा", "water leak", "leaking"],
    vomiting: ["ulti", "उल्टी", "vomit"],
    // child
    notFeeding: ["doodh nahi pi", "dudh nahi pi", "दूध नहीं पी", "stan nahi", "not feeding", "not breastfeeding", "doodh nahi le"],
    lethargic: ["sust", "सुस्त", "behosh", "बेहोश", "lethargic", "unconscious", "not responding"],
    fastBreathing: ["tez saans", "तेज़ सांस", "तेज सांस", "fast breathing", "pasli chal", "पसली चल", "chest indrawing"],
    diarrhoea: ["dast", "दस्त", "jullab", "loose motion", "diarrhoea", "diarrhea", "जुलाब"],
  };

  function hasSign(t, words) {
    for (const w of words) {
      const i = t.indexOf(w);
      if (i === -1) continue;
      const after = t.slice(i + w.length, i + w.length + 18);
      if (new RegExp("^[^.]{0,8}" + NEG).test(after)) continue;
      return true;
    }
    return false;
  }

  function extract(text) {
    const t = normalise(text);
    const f = { raw: String(text || "") };

    const months = numBefore(t, "mahine|mahina|maheene|month|months|महीने|महीना|माह|महिने|महिना");
    const weeks = numBefore(t, "hafte|hafta|week|weeks|wk|सप्ताह|हफ्ते|हफ़्ते|आठवडे");
    if (weeks) f.gestWeeks = Math.round(weeks);
    else if (months) f.gestWeeks = Math.round(months * 4.3);
    if (months) f.months = months;

    const bp = t.match(/(?:bp|बीपी|blood pressure)?\s*(\d{2,3})\s*(?:\/|by|बटा|बाय|over|upon|पर)\s*(\d{2,3})/);
    if (bp) { f.bpSys = +bp[1]; f.bpDia = +bp[2]; }

    const hb = t.match(/(?:hb|h\.b\.|hemoglobin|haemoglobin|हीमोग्लोबिन|एचबी|खून की मात्रा|khoon)\D{0,14}?(\d{1,2}(?:\.\d)?)/);
    if (hb && +hb[1] > 2 && +hb[1] < 20) f.hb = +hb[1];

    const muac = t.match(/(?:muac|म्यूक|मुआक|baanh|बांह|arm)\D{0,12}?(\d{1,3}(?:\.\d)?)/);
    if (muac) f.muacCm = +muac[1] > 30 ? +muac[1] / 10 : +muac[1]; // "115 mm" -> 11.5 cm

    const wt = t.match(/(\d{1,3}(?:\.\d)?)\s*(?:kg|kilo|किलो|केजी)/);
    if (wt) f.weightKg = +wt[1];

    for (const k in SIGNS) if (hasSign(t, SIGNS[k])) f[k] = true;
    // "pairon mein sujan" in a child = bilateral pitting oedema (SAM sign)
    return f;
  }

  const R = (level, code, en, hi) => ({ level, code, en, hi });

  function assessPregnancy(f, p) {
    const out = [];
    const gw = f.gestWeeks || p.gestWeeks || null;
    if (f.hb != null) {
      if (f.hb < 7) out.push(R("RED", "HB_SEVERE", `Severe anaemia (Hb ${f.hb} g/dL < 7)`, `गंभीर खून की कमी (Hb ${f.hb})`));
      else if (f.hb < 10) out.push(R("AMBER", "HB_MODERATE", `Moderate anaemia (Hb ${f.hb} g/dL)`, `खून की कमी (Hb ${f.hb}) – IFA व जाँच`));
      else if (f.hb < 11) out.push(R("GREEN", "HB_MILD", `Mild anaemia (Hb ${f.hb}): IFA daily, diet advice`, `हल्की खून की कमी – रोज़ आयरन गोली`));
    }
    if (f.bpSys != null) {
      if (f.bpSys >= 160 || f.bpDia >= 110) out.push(R("RED", "BP_SEVERE", `Severe high BP ${f.bpSys}/${f.bpDia}`, `बहुत ज़्यादा बीपी ${f.bpSys}/${f.bpDia}`));
      else if (f.bpSys >= 140 || f.bpDia >= 90) {
        const pe = f.headache || f.blurredVision || f.swelling;
        out.push(R("RED", "BP_HIGH",
          `High BP ${f.bpSys}/${f.bpDia}` + (pe ? " with headache/swelling/vision change: possible pre-eclampsia" : ""),
          `बीपी ज़्यादा ${f.bpSys}/${f.bpDia}` + (pe ? " + सिर दर्द/सूजन – प्री-एक्लेम्पसिया का खतरा" : "")));
      }
    }
    if (f.bleeding) out.push(R("RED", "BLEEDING", "Vaginal bleeding in pregnancy", "गर्भावस्था में खून आना"));
    if (f.fits) out.push(R("RED", "FITS", "Fits / convulsions", "दौरे / झटके"));
    if (f.headache && f.blurredVision) out.push(R("RED", "HEADACHE_VISION", "Severe headache with blurred vision", "तेज़ सिर दर्द और धुंधला दिखना"));
    if (f.reducedMovement && (gw == null || gw >= 24)) out.push(R("RED", "FETAL_MOVEMENT", "Reduced fetal movement", "बच्चे का हिलना कम"));
    if (f.leakingWater) out.push(R("RED", "LEAKING", "Leaking of water (possible rupture of membranes)", "पानी गिरना"));
    if (f.breathless) out.push(R(f.hb != null && f.hb < 9 ? "RED" : "AMBER", "BREATHLESS", "Breathlessness", "सांस फूलना"));
    if (f.fever) out.push(R("AMBER", "FEVER", "Fever: check for infection / malaria", "बुखार – जाँच करवाएँ"));
    if (f.abdominalPain) out.push(R("AMBER", "ABD_PAIN", "Abdominal pain", "पेट में दर्द"));
    if (f.swelling && !(f.bpSys >= 140 || f.bpDia >= 90)) out.push(R("AMBER", "SWELLING", "Swelling of feet/face: measure BP today", "पैरों/चेहरे पर सूजन – आज बीपी जाँचें"));
    if (f.headache && !f.blurredVision && !(f.bpSys >= 140 || f.bpDia >= 90)) out.push(R("AMBER", "HEADACHE", "Headache: measure BP today", "सिर दर्द – आज बीपी जाँचें"));

    // profile-based risk factors (from registration)
    if (p.age != null && p.age < 18) out.push(R("AMBER", "AGE_LOW", `Teenage pregnancy (age ${p.age})`, `कम उम्र में गर्भ (${p.age} साल)`));
    if (p.age != null && p.age > 35) out.push(R("AMBER", "AGE_HIGH", `Age above 35 (${p.age})`, `35 से अधिक उम्र (${p.age})`));
    if (p.heightCm != null && p.heightCm < 145) out.push(R("AMBER", "SHORT", `Height ${p.heightCm} cm (< 145)`, `कद 145 सेमी से कम`));
    if (p.prevCsection) out.push(R("AMBER", "PREV_CS", "Previous C-section", "पहले ऑपरेशन से डिलीवरी"));
    if (p.twins) out.push(R("AMBER", "TWINS", "Twin pregnancy", "जुड़वां बच्चे"));

    const notes = [];
    if (gw != null && gw >= 20 && f.bpSys == null) notes.push({ en: "BP not recorded: get BP checked (VHSND / sub-centre)", hi: "बीपी नहीं लिखा – जाँच करवाएँ" });
    if (f.hb == null) notes.push({ en: "Hb not recorded: get Hb tested", hi: "Hb नहीं लिखा – खून की जाँच करवाएँ" });
    return { reasons: out, notes, gestWeeks: gw };
  }

  function assessChild(f, p) {
    const out = [];
    const ageM = p.ageMonths != null ? p.ageMonths : null;
    if (f.muacCm != null && (ageM == null || ageM >= 6)) {
      if (f.muacCm < 11.5) out.push(R("RED", "SAM_MUAC", `Severe acute malnutrition (MUAC ${f.muacCm} cm < 11.5)`, `गंभीर कुपोषण (MUAC ${f.muacCm} सेमी)`));
      else if (f.muacCm < 12.5) out.push(R("AMBER", "MAM_MUAC", `Moderate acute malnutrition (MUAC ${f.muacCm} cm)`, `मध्यम कुपोषण (MUAC ${f.muacCm} सेमी)`));
    }
    if (f.swelling) out.push(R("RED", "OEDEMA", "Swelling of both feet (oedema): SAM sign", "दोनों पैरों में सूजन – गंभीर कुपोषण"));
    if (f.fits) out.push(R("RED", "FITS", "Convulsions", "झटके / दौरे"));
    if (f.lethargic) out.push(R("RED", "LETHARGIC", "Lethargic / unconscious", "बच्चा सुस्त / बेहोश"));
    if (f.notFeeding) out.push(R("RED", "NOT_FEEDING", "Not able to feed", "दूध नहीं पी रहा"));
    if (f.fastBreathing) out.push(R("RED", "FAST_BREATHING", "Fast breathing / chest indrawing (pneumonia sign)", "तेज़ सांस / पसली चलना"));
    if (f.fever) out.push(R(ageM != null && ageM < 2 ? "RED" : "AMBER", "FEVER", "Fever", "बुखार"));
    if (f.diarrhoea) out.push(R("AMBER", "DIARRHOEA", "Diarrhoea: give ORS + zinc, watch for dehydration", "दस्त – ORS और जिंक दें"));
    if (f.vomiting) out.push(R("AMBER", "VOMITING", "Vomiting", "उल्टी"));
    const notes = [];
    if (f.muacCm == null && (ageM == null || ageM >= 6)) notes.push({ en: "MUAC not recorded: measure arm circumference", hi: "MUAC नहीं लिखा – बांह नापें" });
    return { reasons: out, notes };
  }

  const ORDER = { RED: 3, AMBER: 2, GREEN: 1 };
  const ACTIONS = {
    RED: { en: "Refer to PHC today. Arrange 108/102 ambulance if needed. Medical Officer alerted.", hi: "आज ही PHC रेफर करें। ज़रूरत हो तो 108/102 एम्बुलेंस बुलाएँ।", followUpDays: 1 },
    AMBER: { en: "Inform ANM; visit sub-centre / VHSND within 3 days. Follow up at home.", hi: "ANM को बताएँ; 3 दिन में उप-केंद्र / VHSND पर जाँच।", followUpDays: 3 },
    GREEN: { en: "Routine care: continue IFA, nutrition and next scheduled visit.", hi: "सामान्य देखभाल: आयरन गोली, पोषण, अगली विज़िट।", followUpDays: 30 },
  };

  function assess(type, fields, profile) {
    profile = profile || {};
    const r = type === "child" ? assessChild(fields, profile) : assessPregnancy(fields, profile);
    let level = "GREEN";
    for (const x of r.reasons) if (ORDER[x.level] > ORDER[level]) level = x.level;
    r.reasons.sort((a, b) => ORDER[b.level] - ORDER[a.level]);
    return { level, reasons: r.reasons, notes: r.notes, action: ACTIONS[level], gestWeeks: r.gestWeeks };
  }

  return { extract, assess, normalise, ACTIONS };
});
