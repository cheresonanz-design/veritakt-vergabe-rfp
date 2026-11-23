(function () {
  "use strict";
  const engine = window.CheProjectEngine;
  if (!engine) return;
  let activeItems = (engine.SAMPLES.s1.items || []).map((x) => ({ ...x }));
  let lastRes = null;
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function itemsToCsv(items) {
    const header = "ID;Kategorie;Position;Kennzahl;Effekt_EUR;Status;Hinweis";
    const rows = (items || []).map((it, i) => [
      it.id || `POS-${String(i + 1).padStart(2, "0")}`,
      it.category || "Prüfpunkt",
      it.label || "Position",
      Number(it.metric || 0).toFixed(2),
      Number(it.impact_eur || 0).toFixed(2),
      it.status || "",
      it.note || "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
    return [header, ...rows].join("\n");
  }

  function parseCsvLine(line, sep) {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else if (ch === '"') {
          inQ = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === sep) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function parseCsvToItems(text) {
    const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const sep = lines[0].includes(";") ? ";" : ",";
    const parsed = [];
    lines.forEach((line, idx) => {
      const cols = parseCsvLine(line, sep);
      if (idx === 0 && /^id$/i.test(cols[0] || "")) return;
      if (cols.length >= 8) {
        parsed.push({
          id: cols[0] || `POS-${parsed.length + 1}`,
          category: cols[1] || "Eigener Prüfpunkt",
          label: cols[2] || "Position",
          metric: parseFloat(String(cols[3] || "0").replace(",", ".")) || 0,
          base_eur: parseFloat(String(cols[4] || "0").replace(",", ".")) || 0,
          impact_eur: parseFloat(String(cols[5] || "0").replace(",", ".")) || 0,
          status: (cols[6] || "").toUpperCase(),
          note: cols[7] || "",
        });
      } else if (cols.length >= 3) {
        parsed.push({
          id: cols[0] || `POS-${parsed.length + 1}`,
          category: cols[1] || "Eigener Prüfpunkt",
          label: cols[2] || "Position",
          metric: parseFloat(String(cols[3] || "80").replace(",", ".")) || 0,
          base_eur: 0,
          impact_eur: parseFloat(String(cols[4] || "0").replace(",", ".")) || 0,
          status: (cols[5] || "").toUpperCase(),
          note: cols[6] || "",
        });
      } else if (cols.length >= 1 && cols[0]) {
        parsed.push({
          id: `POS-${parsed.length + 1}`,
          category: "Eigener Prüfpunkt",
          label: cols[0],
          metric: parseFloat(String(cols[1] || "80").replace(",", ".")) || 0,
          base_eur: 0,
          impact_eur: 0,
          status: "",
          note: "",
        });
      }
    });
    return parsed;
  }

  function syncCsvBox() {
    const box = el("batchCsvInput");
    if (box) box.value = itemsToCsv(activeItems);
  }

  function applySample(s) {
    el("profileInput").value = s.profile_name;
    el("modeSelect").value = s.mode;
    el("toneSelect").value = s.tone;
    activeItems = (s.items || []).map((x) => ({ ...x }));
    syncCsvBox();
    runCheck();
  }

  function runCheck() {
    el("resultCard").classList.remove("hidden");
    if (!activeItems.length) {
      lastRes = null;
      const profileName = el("profileInput").value || engine.META.default_profile || "Profil";
      el("kpi1Val").textContent = "0 %";
      el("kpi2Val").textContent = "0 FAIL / 0 WARN";
      el("kpi3Val").textContent = "0.00 EUR";
      el("kpi4Val").textContent = "0.00 EUR";
      el("resultHeadline").textContent = `${profileName}: Noch keine Positionen erfasst`;
      el("actionBox").value = "";
      el("entriesBody").innerHTML = '<tr><td colspan="7" class="muted">Keine Positionen aktiv. Fügen Sie oben eine eigene Position hinzu oder laden Sie ein Demo-Szenario.</td></tr>';
      return;
    }
    const res = engine.evaluateCase({
      profile_name: el("profileInput").value,
      mode: el("modeSelect").value,
      tone: el("toneSelect").value,
      items: activeItems,
    });
    lastRes = res;
    el("kpi1Val").textContent = `${res.readiness_percent} %`;
    el("kpi2Val").textContent = `${res.summary.fail_count} FAIL / ${res.summary.warn_count} WARN`;
    el("kpi3Val").textContent = `${res.impact_eur.toFixed(2)} EUR`;
    el("kpi4Val").textContent = `${res.annual_impact_eur.toFixed(2)} EUR`;
    el("resultHeadline").textContent = res.ok
      ? `${res.profile_name}: DACH-Prüfung ohne Blocker bestanden`
      : `${res.profile_name}: ${res.summary.fail_count + res.summary.warn_count} Handlungsfeld(er) erkannt`;
    el("actionBox").value = res.action_text;

    el("entriesBody").innerHTML = res.entries.map((e, idx) => {
      const cls = e.status === "PASS" ? "badge-pass" : e.status === "WARN" ? "badge-warn" : "badge-fail";
      return `<tr><td><code>${esc(e.id)}</code></td><td><strong>${esc(e.label)}</strong><div class="muted">${esc(e.category)}</div></td><td>${e.metric.toFixed(2)}</td><td>${e.impact_eur.toFixed(2)} EUR</td><td><span class="badge ${cls}">${esc(e.status)}</span></td><td>${esc(e.note)}</td><td><button type="button" class="btn btn-sm remove-item-btn" data-idx="${idx}" title="Position entfernen">&times;</button></td></tr>`;
    }).join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!el("runCheckBtn")) return;
    el("runCheckBtn").addEventListener("click", runCheck);
    el("modeSelect").addEventListener("change", runCheck);
    el("toneSelect").addEventListener("change", runCheck);
    el("sample1Btn").addEventListener("click", () => applySample(engine.SAMPLES.s1));
    el("sample2Btn").addEventListener("click", () => applySample(engine.SAMPLES.s2));
    el("sample3Btn").addEventListener("click", () => applySample(engine.SAMPLES.s3));

    if (el("addItemBtn")) {
      el("addItemBtn").addEventListener("click", () => {
        const label = (el("posLabelInput").value || "").trim();
        if (!label) {
          el("posLabelInput").focus();
          return;
        }
        const nextNum = String(activeItems.length + 1).padStart(2, "0");
        const idVal = (el("posIdInput").value || "").trim() || `${engine.META.pid || "POS"}-${nextNum}`;
        const catVal = (el("posCategoryInput").value || "").trim() || "Eigener Prüfpunkt";
        const metricVal = parseFloat(el("posMetricInput").value) || 0;
        const impactVal = parseFloat(el("posImpactInput").value) || 0;
        const statusRaw = el("posStatusSelect").value || "";
        const noteVal = (el("posNoteInput").value || "").trim();
        activeItems.push({
          id: idVal,
          label,
          category: catVal,
          metric: metricVal,
          base_eur: 0,
          impact_eur: impactVal,
          status: statusRaw === "AUTO" ? "" : statusRaw,
          note: noteVal,
        });
        el("posIdInput").value = "";
        el("posLabelInput").value = "";
        el("posNoteInput").value = "";
        syncCsvBox();
        runCheck();
      });
    }

    if (el("clearItemsBtn")) {
      el("clearItemsBtn").addEventListener("click", () => {
        activeItems = [];
        syncCsvBox();
        runCheck();
      });
    }

    if (el("applyCsvBtn")) {
      el("applyCsvBtn").addEventListener("click", () => {
        activeItems = parseCsvToItems(el("batchCsvInput").value);
        syncCsvBox();
        runCheck();
      });
    }

    el("entriesBody").addEventListener("click", (ev) => {
      const btn = ev.target.closest(".remove-item-btn");
      if (!btn) return;
      const idx = Number(btn.getAttribute("data-idx"));
      if (!Number.isNaN(idx) && idx >= 0 && idx < activeItems.length) {
        activeItems.splice(idx, 1);
        syncCsvBox();
        runCheck();
      }
    });

    el("copyActionBtn").addEventListener("click", async () => {
      if (!lastRes || !navigator.clipboard) return;
      await navigator.clipboard.writeText(lastRes.action_text);
      el("copyActionBtn").textContent = "Text kopiert!";
      setTimeout(() => (el("copyActionBtn").textContent = "Maßnahmentext kopieren"), 1800);
    });
    el("dlCsvBtn").addEventListener("click", () => {
      if (!lastRes) return;
      const blob = new Blob([lastRes.export_csv], { type: "text/csv;charset=utf-8" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `${engine.META.slug}_export.csv`;
      a.click();
      URL.revokeObjectURL(u);
    });
    el("dlJsonBtn").addEventListener("click", () => {
      if (!lastRes) return;
      const blob = new Blob([engine.formatAuditReportJson(lastRes)], { type: "application/json" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `${engine.META.slug}_audit.json`;
      a.click();
      URL.revokeObjectURL(u);
    });
    applySample(engine.SAMPLES.s1);
  });
})();
