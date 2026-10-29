/* ASHA Saathi: ASHA-facing offline app.
 * All data lives in localStorage on the phone; unsynced records are queued and pushed
 * to the PHC server (/api/sync) whenever the phone is online. */
(() => {
  "use strict";
  const E = window.AshaEngine;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
  const fmt = (iso) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("asha_" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("asha_" + k, JSON.stringify(v)); } catch { toast("Storage full / blocked"); } },
  };
  let settings = store.get("settings", null);
  if (!settings) {
    settings = { ashaName: "Sunanda Patil", ashaId: "ASHA-" + Math.floor(1000 + Math.random() * 9000), village: "Kharde Bk",
      phc: "Kharde Bk PHC (demo)", district: "Dhule", lang: "mr-IN", forceOffline: false, server: "" };
    store.set("settings", settings);
  }
  let people = store.get("people", null);
  let visits = store.get("visits", []);
  if (!people) { people = demoPeople(); store.set("people", people); }
  const save = () => { store.set("people", people); store.set("visits", visits); store.set("settings", settings); renderSyncBar(); };

  function demoPeople() {
    const v = () => settings.village, now = new Date().toISOString();
    const mk = (o) => ({ id: uid(), createdAt: now, village: v(), synced: false, ...o });
    return [
      mk({ type: "pregnant", name: "Sunita Bhil", age: 24, heightCm: 152, gestWeeks: 30, husband: "Ramesh", phone: "" }),
      mk({ type: "pregnant", name: "Pooja Pawara", age: 17, heightCm: 148, gestWeeks: 18, husband: "Sanjay", phone: "" }),
      mk({ type: "pregnant", name: "Kavita Patil", age: 31, heightCm: 158, gestWeeks: 34, prevCsection: true, husband: "Vijay", phone: "" }),
      mk({ type: "pregnant", name: "Rekha Thakre", age: 22, heightCm: 155, gestWeeks: 12, husband: "Anil", phone: "" }),
      mk({ type: "child", name: "Aarav (s/o Sunita)", ageMonths: 18, sex: "M", mother: "Sunita Bhil" }),
      mk({ type: "child", name: "Anvi (d/o Rekha)", ageMonths: 9, sex: "F", mother: "Rekha Thakre" }),
    ];
  }

  // ---------- network / sync ----------
  const isOnline = () => navigator.onLine && !settings.forceOffline;
  const api = (p) => (settings.server || "") + p;
  const pending = () => people.filter((p) => !p.synced).length + visits.filter((v) => !v.synced).length;

  async function sync(silent) {
    if (!isOnline()) { if (!silent) toast("ऑफ़लाइन – डेटा फ़ोन में सुरक्षित है"); return; }
    const ps = people.filter((p) => !p.synced), vs = visits.filter((v) => !v.synced);
    if (!ps.length && !vs.length) { if (!silent) toast("सब सिंक हो चुका ✓"); return; }
    try {
      const res = await fetch(api("/api/sync"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asha: { id: settings.ashaId, name: settings.ashaName, village: settings.village, phc: settings.phc }, beneficiaries: ps, visits: vs }),
      });
      if (!res.ok) throw new Error(res.status);
      const out = await res.json();
      ps.forEach((p) => (p.synced = true)); vs.forEach((v) => (v.synced = true));
      save();
      toast(`सिंक ✓ ${vs.length} विज़िट भेजी` + (out.alerts ? ` · ${out.alerts} RED अलर्ट डॉक्टर को` : ""));
    } catch (e) {
      if (!silent) toast("सर्वर से कनेक्ट नहीं हुआ – बाद में सिंक होगा");
    }
    render();
  }
  window.addEventListener("online", () => { renderNet(); sync(true); });
  window.addEventListener("offline", renderNet);

  function renderNet() {
    const b = $("#netBtn"), on = isOnline();
    b.className = "net " + (on ? "on" : "off");
    b.textContent = on ? "● ऑनलाइन" : "● ऑफ़लाइन";
    renderSyncBar();
  }
  function renderSyncBar() {
    const n = pending(), bar = $("#syncbar");
    bar.className = "syncbar" + (n ? "" : " ok");
    bar.innerHTML = n
      ? `<span>⏳ ${n} रिकॉर्ड सिंक बाकी (फ़ोन में सुरक्षित)</span><button id="syncNow">अभी सिंक</button>`
      : `<span>✓ सारा डेटा PHC सर्वर पर सिंक है</span>`;
    const b = $("#syncNow"); if (b) b.onclick = () => sync(false);
  }
  $("#netBtn").onclick = () => {
    settings.forceOffline = !settings.forceOffline; save(); renderNet();
    toast(settings.forceOffline ? "ऑफ़लाइन मोड (डेमो): डेटा फ़ोन में रहेगा" : "ऑनलाइन – सिंक हो रहा है");
    if (!settings.forceOffline) sync(true);
  };

  // ---------- helpers ----------
  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2800); }
  const lastVisit = (pid) => visits.filter((v) => v.beneficiaryId === pid).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const LV_HI = { RED: "लाल – आज रेफर", AMBER: "पीला – ध्यान दें", GREEN: "हरा – सामान्य", NONE: "विज़िट नहीं" };
  const badge = (lvl) => `<span class="badge ${lvl}">${lvl === "NONE" ? "नई" : lvl}</span>`;
  const desc = (p) => p.type === "pregnant"
    ? `गर्भवती · ${p.age} साल · ${p.gestWeeks ? p.gestWeeks + " सप्ताह" : ""}`
    : `बच्चा · ${p.ageMonths} माह · माँ: ${p.mother || "-"}`;

  // ---------- routing ----------
  const routes = { home, visit, register, person, slip, settings: settingsView };
  function go(name, arg) { location.hash = arg ? `${name}/${arg}` : name; }
  function render() {
    const [name, arg] = (location.hash.slice(1) || "home").split("/");
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.go === name));
    $("#who").textContent = `${settings.ashaName} · ${settings.village}`;
    (routes[name] || home)(arg ? decodeURIComponent(arg) : undefined);
    window.scrollTo(0, 0); $("main").scrollTop = 0;
  }
  window.addEventListener("hashchange", render);
  document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) { e.preventDefault(); go(g.dataset.go, g.dataset.arg); } });

  // ---------- views ----------
  function home() {
    const withLv = people.map((p) => ({ p, v: lastVisit(p.id) })).map((x) => ({ ...x, lvl: x.v ? x.v.level : "NONE" }));
    const order = { RED: 0, AMBER: 1, NONE: 2, GREEN: 3 };
    withLv.sort((a, b) => order[a.lvl] - order[b.lvl]);
    const cnt = (l) => withLv.filter((x) => x.lvl === l).length;
    const due = withLv.filter((x) => x.v && x.v.followUp <= today() && x.lvl !== "GREEN");
    $("#view").innerHTML = `
      <button class="big-mic" data-go="visit">🎤 विज़िट बोलें / भेट नोंदवा</button>
      <div class="stats">
        <div class="stat red"><b>${cnt("RED")}</b><small>लाल (रेफर)</small></div>
        <div class="stat amber"><b>${cnt("AMBER")}</b><small>पीला</small></div>
        <div class="stat green"><b>${cnt("GREEN")}</b><small>हरा</small></div>
      </div>
      <h2>आज के फ़ॉलो-अप (${due.length})</h2>
      ${due.length ? due.map(row).join("") : `<div class="card empty">आज कोई फ़ॉलो-अप बाकी नहीं</div>`}
      <h2>मेरे परिवार (${people.length})</h2>
      ${withLv.map(row).join("")}
      <button class="btn ghost" data-go="register">➕ नई गर्भवती / बच्चा जोड़ें</button>`;
    function row(x) {
      return `<div class="card person" data-go="person" data-arg="${x.p.id}">
        <div class="avatar">${x.p.type === "pregnant" ? "🤰" : "👶"}</div>
        <div class="info"><div class="name">${esc(x.p.name)}</div>
        <div class="meta">${esc(desc(x.p))}${x.v ? " · " + esc(x.v.reasons[0] ? x.v.reasons[0].hi : "सामान्य") : ""}</div></div>
        ${badge(x.lvl)}</div>`;
    }
  }

  function person(id) {
    const p = people.find((x) => x.id === id);
    if (!p) return home();
    const vs = visits.filter((v) => v.beneficiaryId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $("#view").innerHTML = `
      <div class="card"><div class="person"><div class="avatar">${p.type === "pregnant" ? "🤰" : "👶"}</div>
        <div class="info"><div class="name">${esc(p.name)}</div><div class="meta">${esc(desc(p))}</div></div>${badge(vs[0] ? vs[0].level : "NONE")}</div>
        <dl class="kv" style="margin-top:10px">
          ${p.type === "pregnant" ? `<dt>पति</dt><dd>${esc(p.husband || "-")}</dd><dt>कद</dt><dd>${p.heightCm || "-"} cm</dd>
          <dt>पहले ऑपरेशन</dt><dd>${p.prevCsection ? "हाँ" : "नहीं"}</dd>` : `<dt>लिंग</dt><dd>${p.sex === "F" ? "लड़की" : "लड़का"}</dd>`}
          <dt>गाँव</dt><dd>${esc(p.village)}</dd></dl></div>
      <button class="big-mic" data-go="visit" data-arg="${p.id}">🎤 ${esc(p.name.split(" ")[0])} की विज़िट बोलें</button>
      <h2>विज़िट इतिहास</h2>
      <div class="card history">${vs.length ? vs.map((v) => `<div class="v ${v.level}"><b>${fmt(v.createdAt)}</b> · ${badge(v.level)}<br>
        ${esc(v.transcript)}<br><span class="hi">${v.reasons.map((r) => esc(r.hi)).join(", ") || "सामान्य"}</span>
        ${v.level !== "GREEN" ? ` · <a href="#slip/${v.id}">रेफरल पर्ची</a>` : ""}</div>`).join("") : `<div class="empty">अभी कोई विज़िट नहीं</div>`}</div>`;
  }

  const SAMPLES = {
    pregnant: [
      ["मराठी: BP जास्त", "सात महिने, पायांवर सूज, दोन दिवसांपासून डोकं दुखतंय, बीपी 150/100"],
      ["Hindi: BP high", "सात महीने की गर्भवती, पैरों में सूजन, दो दिन से सिर दर्द, बीपी 150 बटा 100"],
      ["Hinglish: anaemia", "5 mahine, hb 8.2, thakaan, BP 110/70, sujan nahi"],
      ["Normal", "8 mahine, BP 118/76, Hb 11.6, bachcha theek hil raha hai"],
      ["Bleeding", "9 mahine, khoon aa raha hai, pet dard"],
    ],
    child: [
      ["SAM (MUAC)", "MUAC 11.2 cm, vajan 7.1 kg, doodh kam pi raha"],
      ["Diarrhoea", "dast ho rahe hain do din se, MUAC 13.1"],
      ["Normal", "MUAC 13.8, vajan 9.5 kg, khana theek kha raha hai"],
    ],
  };

  let rec = null;
  function visit(id) {
    if (!id) {
      $("#view").innerHTML = `<h2>किसकी विज़िट है?</h2>` + people.map((p) =>
        `<div class="card person" data-go="visit" data-arg="${p.id}"><div class="avatar">${p.type === "pregnant" ? "🤰" : "👶"}</div>
         <div class="info"><div class="name">${esc(p.name)}</div><div class="meta">${esc(desc(p))}</div></div>›</div>`).join("");
      return;
    }
    const p = people.find((x) => x.id === id);
    if (!p) return home();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    $("#view").innerHTML = `
      <div class="card person"><div class="avatar">${p.type === "pregnant" ? "🤰" : "👶"}</div>
        <div class="info"><div class="name">${esc(p.name)}</div><div class="meta">${esc(desc(p))}</div></div></div>
      <label>भाषा / Language</label>
      <select id="lang"><option value="mr-IN">मराठी</option><option value="hi-IN">हिन्दी</option><option value="en-IN">English</option></select>
      <button class="mic" id="mic" title="Speak">🎤</button>
      <div class="hint" id="micHint">${SR ? "दबाएँ और विज़िट की बात बोलें" : "इस ब्राउज़र में आवाज़ उपलब्ध नहीं – नीचे लिखें या उदाहरण चुनें (Chrome उपयोग करें)"}</div>
      <label>जो बोला गया / Transcript (सुधार सकते हैं)</label>
      <textarea id="tx" placeholder="उदा.: सात महीने, पैरों में सूजन, बीपी 150/100"></textarea>
      <div class="chips" id="chips">${SAMPLES[p.type].map((s, i) => `<button data-i="${i}">${esc(s[0])}</button>`).join("")}</div>
      <button class="btn orange" id="analyse">जाँचें / Check risk</button>
      <div id="out"></div>`;
    $("#lang").value = settings.lang;
    $("#lang").onchange = (e) => { settings.lang = e.target.value; save(); };
    $("#chips").onclick = (e) => { const b = e.target.closest("button"); if (b) { $("#tx").value = SAMPLES[p.type][b.dataset.i][1]; analyse(); } };
    $("#analyse").onclick = analyse;
    $("#mic").onclick = () => {
      if (!SR) return toast("Voice needs Chrome / Edge");
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = settings.lang; rec.interimResults = true; rec.continuous = true;
      const base = $("#tx").value ? $("#tx").value + " " : "";
      rec.onresult = (e) => { let s = ""; for (const r of e.results) s += r[0].transcript; $("#tx").value = base + s; };
      rec.onerror = (e) => toast(e.error === "network" ? "आवाज़ पहचान के लिए नेटवर्क चाहिए – लिखकर भी कर सकते हैं" : "Mic: " + e.error);
      rec.onend = () => { $("#mic").classList.remove("live"); $("#micHint").textContent = "दबाएँ और बोलें"; rec = null; if ($("#tx").value.trim()) analyse(); };
      rec.start(); $("#mic").classList.add("live"); $("#micHint").textContent = "सुन रहे हैं… रुकने के लिए फिर दबाएँ";
    };

    let current = null;
    function analyse() {
      const text = $("#tx").value.trim();
      if (!text) return toast("पहले बोलें या लिखें");
      const f = E.extract(text);
      const r = E.assess(p.type, f, p);
      current = { f, r, text };
      const fields = [];
      if (f.gestWeeks) fields.push(["गर्भ / Weeks", f.gestWeeks + " सप्ताह"]);
      if (f.bpSys) fields.push(["BP", `${f.bpSys}/${f.bpDia} mmHg`]);
      if (f.hb) fields.push(["Hb", f.hb + " g/dL"]);
      if (f.muacCm) fields.push(["MUAC", f.muacCm + " cm"]);
      if (f.weightKg) fields.push(["वज़न", f.weightKg + " kg"]);
      const signs = { swelling: "सूजन", headache: "सिर दर्द", blurredVision: "धुंधला दिखना", bleeding: "खून आना", fits: "दौरे", reducedMovement: "हलचल कम",
        fever: "बुखार", breathless: "सांस फूलना", abdominalPain: "पेट दर्द", leakingWater: "पानी गिरना", vomiting: "उल्टी",
        notFeeding: "दूध नहीं पी रहा", lethargic: "सुस्त", fastBreathing: "तेज़ सांस", diarrhoea: "दस्त" };
      const found = Object.keys(signs).filter((k) => f[k]).map((k) => signs[k]);
      if (found.length) fields.push(["लक्षण", found.join(", ")]);
      $("#out").innerHTML = `
        <div class="result ${r.level}">
          <div class="lvl">${r.level === "RED" ? "🔴" : r.level === "AMBER" ? "🟡" : "🟢"} ${LV_HI[r.level]}</div>
          <ul>${r.reasons.map((x) => `<li><b>${esc(x.hi)}</b><br><span class="hi">${esc(x.en)}</span></li>`).join("") || "<li>कोई खतरे का लक्षण नहीं मिला</li>"}</ul>
          <div class="action"><b>क्या करें:</b> ${esc(r.action.hi)}<br><span class="hi">${esc(r.action.en)}</span></div>
          ${r.notes.map((n) => `<div class="action">ℹ️ ${esc(n.hi)}</div>`).join("")}
        </div>
        <div class="card" style="margin-top:10px"><b>ऐप ने समझा / Extracted</b>
          <dl class="kv" style="margin-top:6px">${fields.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("") || "<dt>-</dt><dd>कुछ नहीं – और जानकारी बोलें</dd>"}</dl></div>
        <div class="btns"><button class="btn ghost" id="speak">🔊 सुनें</button><button class="btn" id="saveV">💾 सेव करें</button></div>
        <p class="hint">निर्णय सहायता मात्र – अंतिम निर्णय ANM / डॉक्टर का।</p>`;
      $("#speak").onclick = () => {
        const u = new SpeechSynthesisUtterance(`${LV_HI[r.level]}. ${r.reasons.map((x) => x.hi).join(". ")}. ${r.action.hi}`);
        u.lang = "hi-IN"; speechSynthesis.cancel(); speechSynthesis.speak(u);
      };
      $("#saveV").onclick = saveVisit;
    }
    function saveVisit() {
      if (!current) return;
      const { f, r, text } = current;
      const v = { id: uid(), beneficiaryId: p.id, createdAt: new Date().toISOString(), transcript: text, fields: f, level: r.level,
        reasons: r.reasons, action: r.action, followUp: addDays(r.action.followUpDays), lang: settings.lang, synced: false };
      if (f.gestWeeks) p.gestWeeks = f.gestWeeks;
      p.synced = false;
      visits.push(v); save();
      toast(isOnline() ? "सेव ✓ PHC को भेज रहे हैं…" : "सेव ✓ फ़ोन में (ऑफ़लाइन) – नेटवर्क आने पर सिंक");
      sync(true);
      if (v.level !== "GREEN") go("slip", v.id); else go("person", p.id);
    }
  }

  function slip(vid) {
    const v = visits.find((x) => x.id === vid);
    if (!v) return home();
    const p = people.find((x) => x.id === v.beneficiaryId) || {};
    $("#view").innerHTML = `
      <div class="slip">
        <h3>रेफरल पर्ची / Referral Slip</h3>
        <div class="c">ASHA Saathi · ${esc(settings.phc)} · ${esc(settings.district)}</div>
        <div class="result ${v.level}" style="margin:0 0 8px;padding:8px 10px"><span class="lvl" style="font-size:17px">${LV_HI[v.level]}</span></div>
        <table>
          <tr><td>नाम / Name</td><td><b>${esc(p.name)}</b> ${p.type === "pregnant" ? `(${p.age} yrs)` : `(${p.ageMonths} months)`}</td></tr>
          <tr><td>${p.type === "pregnant" ? "पति / Husband" : "माँ / Mother"}</td><td>${esc(p.husband || p.mother || "-")}</td></tr>
          <tr><td>गाँव / Village</td><td>${esc(p.village)}</td></tr>
          <tr><td>तारीख / Date</td><td>${fmt(v.createdAt)}</td></tr>
          ${v.fields.gestWeeks ? `<tr><td>Gestation</td><td>${v.fields.gestWeeks} weeks</td></tr>` : ""}
          ${v.fields.bpSys ? `<tr><td>BP</td><td>${v.fields.bpSys}/${v.fields.bpDia} mmHg</td></tr>` : ""}
          ${v.fields.hb ? `<tr><td>Hb</td><td>${v.fields.hb} g/dL</td></tr>` : ""}
          ${v.fields.muacCm ? `<tr><td>MUAC</td><td>${v.fields.muacCm} cm</td></tr>` : ""}
          <tr><td>कारण / Reasons</td><td>${v.reasons.map((r) => esc(r.en)).join("<br>")}</td></tr>
          <tr><td>ASHA के शब्द</td><td><i>${esc(v.transcript)}</i></td></tr>
          <tr><td>ASHA</td><td>${esc(settings.ashaName)} (${esc(settings.ashaId)})</td></tr>
        </table>
        <div style="font-size:12.5px">${esc(v.action.en)}</div>
      </div>
      <div class="btns no-print"><button class="btn ghost" onclick="window.print()">🖨️ प्रिंट</button>
      <button class="btn" data-go="person" data-arg="${p.id}">✓ ठीक है</button></div>`;
  }

  function register() {
    let type = "pregnant";
    $("#view").innerHTML = `
      <h2>नया पंजीकरण / Register</h2>
      <div class="seg" id="seg"><button data-t="pregnant" class="sel">🤰 गर्भवती</button><button data-t="child">👶 बच्चा</button></div>
      <form id="f">
        <label>नाम / Name</label><input name="name" required>
        <div id="pf">
          <div class="row"><div><label>उम्र (साल)</label><input name="age" type="number" min="12" max="55" required></div>
          <div><label>कद (cm)</label><input name="heightCm" type="number" min="120" max="190"></div></div>
          <div class="row"><div><label>गर्भ के सप्ताह</label><input name="gestWeeks" type="number" min="4" max="42"></div>
          <div><label>पति का नाम</label><input name="husband"></div></div>
          <label class="check"><input type="checkbox" name="prevCsection"> पहले ऑपरेशन (C-section)</label>
          <label class="check"><input type="checkbox" name="twins"> जुड़वां</label>
        </div>
        <div id="cf" hidden>
          <div class="row"><div><label>उम्र (महीने)</label><input name="ageMonths" type="number" min="0" max="60"></div>
          <div><label>लिंग</label><select name="sex"><option value="M">लड़का</option><option value="F">लड़की</option></select></div></div>
          <label>माँ का नाम</label><input name="mother">
        </div>
        <label>गाँव</label><input name="village" value="${esc(settings.village)}">
        <button class="btn orange" type="submit">सेव करें</button>
      </form>`;
    $("#seg").onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      type = b.dataset.t;
      document.querySelectorAll("#seg button").forEach((x) => x.classList.toggle("sel", x === b));
      $("#pf").hidden = type !== "pregnant"; $("#cf").hidden = type !== "child";
      $("#f").age.required = type === "pregnant"; $("#f").ageMonths.required = type === "child";
    };
    $("#f").onsubmit = (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const num = (k) => (d[k] === "" || d[k] == null ? null : +d[k]);
      const p = { id: uid(), type, name: d.name.trim(), village: d.village || settings.village, createdAt: new Date().toISOString(), synced: false };
      if (type === "pregnant") Object.assign(p, { age: num("age"), heightCm: num("heightCm"), gestWeeks: num("gestWeeks"), husband: d.husband, prevCsection: !!d.prevCsection, twins: !!d.twins });
      else Object.assign(p, { ageMonths: num("ageMonths"), sex: d.sex, mother: d.mother });
      people.push(p); save(); sync(true);
      toast("पंजीकरण सेव ✓"); go("visit", p.id);
    };
  }

  function settingsView() {
    $("#view").innerHTML = `
      <h2>सेटिंग / Settings</h2>
      <form id="s" class="card">
        <label>ASHA का नाम</label><input name="ashaName" value="${esc(settings.ashaName)}">
        <label>ASHA ID</label><input name="ashaId" value="${esc(settings.ashaId)}">
        <div class="row"><div><label>गाँव</label><input name="village" value="${esc(settings.village)}"></div>
        <div><label>ज़िला</label><input name="district" value="${esc(settings.district)}"></div></div>
        <label>PHC</label><input name="phc" value="${esc(settings.phc)}">
        <label>Server URL (खाली = यही सर्वर)</label><input name="server" value="${esc(settings.server)}" placeholder="https://...">
        <button class="btn" type="submit">सेव</button>
      </form>
      <button class="btn ghost" id="reset">डेमो रीसेट (सारा फ़ोन डेटा मिटाएँ)</button>
      <p class="hint">ASHA Saathi prototype · Team VictoryVerse, NMIMS MPSTME Shirpur</p>`;
    $("#s").onsubmit = (e) => { e.preventDefault(); Object.assign(settings, Object.fromEntries(new FormData(e.target))); save(); toast("सेव ✓"); go("home"); };
    $("#reset").onclick = () => {
      if (!confirm("फ़ोन का सारा डेमो डेटा मिटाएँ?")) return;
      visits = []; people = demoPeople(); save(); toast("रीसेट ✓"); go("home");
    };
  }

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1"))
    navigator.serviceWorker.register("sw.js").catch(() => {});
  renderNet(); render(); sync(true);
})();
