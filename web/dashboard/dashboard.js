/* PHC Medical Officer dashboard: polls the server every 4 s for synced visits. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (iso) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  let level = "ALL", village = "", cases = [], seen = null;

  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    level = b.dataset.l;
    document.querySelectorAll("#filters button").forEach((x) => x.classList.toggle("sel", x === b));
    renderRows();
  });
  $("#village").onchange = (e) => { village = e.target.value; renderRows(); };

  async function load() {
    try {
      const [s, c] = await Promise.all([fetch("/api/summary").then((r) => r.json()), fetch("/api/cases").then((r) => r.json())]);
      const fresh = seen ? c.filter((x) => !seen.has(x.visitId)) : [];
      seen = new Set(c.map((x) => x.visitId));
      cases = c;
      renderKpis(s); renderVillages(s.villages); renderAlerts(s.alerts); renderVillageOptions(); renderRows(new Set(fresh.map((x) => x.visitId)));
      const red = fresh.find((x) => x.level === "RED");
      if (red) toast(`🔴 New RED case: ${red.name}, ${red.village}. ${red.reasons[0] ? red.reasons[0].en : ""}`);
      $("#updated").textContent = new Date().toLocaleTimeString("en-IN");
    } catch {
      $("#updated").textContent = "server not reachable";
    }
  }

  function renderKpis(s) {
    $("#kpis").innerHTML = [
      ["", s.registered, `Registered (${s.pregnant} pregnant, ${s.children} children)`],
      ["", s.ashas, "ASHAs reporting"],
      ["red", s.red, "RED: refer today"],
      ["amber", s.amber, "AMBER: follow-up"],
      ["green", s.green, "GREEN: routine"],
      ["red", s.openReferrals, "Open RED referrals"],
    ].map(([c, n, l]) => `<div class="kpi ${c}"><b>${n}</b><small>${l}</small></div>`).join("");
  }

  function renderVillageOptions() {
    const vs = [...new Set(cases.map((c) => c.village))].sort();
    const sel = $("#village");
    if (sel.options.length - 1 !== vs.length)
      sel.innerHTML = `<option value="">All villages</option>` + vs.map((v) => `<option ${v === village ? "selected" : ""}>${esc(v)}</option>`).join("");
  }

  function renderRows(fresh = new Set()) {
    const rows = cases.filter((c) => (level === "ALL" || c.level === level) && (!village || c.village === village));
    $("#rows").innerHTML = rows.length ? rows.map((c) => {
      const who = c.type === "pregnant"
        ? `Pregnant · ${c.age ?? "?"} yrs${c.fields.gestWeeks || c.gestWeeks ? ` · ${c.fields.gestWeeks || c.gestWeeks} wks` : ""}`
        : `Child · ${c.ageMonths ?? "?"} months`;
      const vit = [c.fields.bpSys ? `BP ${c.fields.bpSys}/${c.fields.bpDia}` : "", c.fields.hb ? `Hb ${c.fields.hb}` : "", c.fields.muacCm ? `MUAC ${c.fields.muacCm} cm` : ""].filter(Boolean).join(" · ");
      return `<tr class="${fresh.has(c.visitId) ? "new" : ""}">
        <td><span class="badge ${c.level}">${c.level}</span></td>
        <td><div class="nm">${esc(c.name)}</div><div class="mt">${esc(who)}</div>${vit ? `<div class="mt">${esc(vit)}</div>` : ""}</td>
        <td>${esc(c.village)}<div class="mt">ASHA ${esc(c.asha)}</div></td>
        <td><ul class="reasons">${c.reasons.map((r) => `<li>${esc(r.en)}</li>`).join("") || "<li>No danger sign</li>"}</ul>
            <div class="quote">"${esc(c.transcript)}"</div></td>
        <td>${fmt(c.createdAt)}<div class="mt">synced ${fmt(c.syncedAt)}</div></td>
        <td>${c.level === "GREEN" ? "-" : `<select data-id="${c.visitId}">${["New", "Called", "Reached PHC", "Closed"].map((s) => `<option ${s === c.status ? "selected" : ""}>${s}</option>`).join("")}</select>`}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="6" class="empty">No visits synced yet. Record a visit in the ASHA app (/app/) to see it here.</td></tr>`;
  }

  $("#rows").addEventListener("change", async (e) => {
    const s = e.target.closest("select[data-id]"); if (!s) return;
    await fetch(`/api/visits/${encodeURIComponent(s.dataset.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s.value }) });
    load();
  });

  function renderVillages(vs) {
    $("#villages").innerHTML = vs.length ? vs.map((v) => {
      const t = v.red + v.amber + v.green || 1;
      return `<div class="vbar"><div class="lab"><b>${esc(v.village)}</b><span>${v.red} red · ${v.amber} amber · ${v.green} green</span></div>
        <div class="bar"><span style="width:${(v.red / t) * 100}%"></span><span style="width:${(v.amber / t) * 100}%"></span><span style="width:${(v.green / t) * 100}%"></span></div></div>`;
    }).join("") : `<div class="empty">No data yet</div>`;
  }

  function renderAlerts(as) {
    $("#alerts").innerHTML = as.length ? as.map((a) => `<div class="alert"><time>${fmt(a.sent_at)} → ${esc(a.recipient)}</time>${esc(a.message)}</div>`).join("")
      : `<div class="empty">No RED alerts</div>`;
  }

  let tt;
  function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 6000); }

  load(); setInterval(load, 4000);
})();
