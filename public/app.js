/*
 * app.js — OoT 100% binge tracker UI.
 * Renders the linear route from data/route.json, talks to state only via Store.
 */
(function () {
  "use strict";

  const $ = (sel, el) => (el || document).querySelector(sel);
  const elApp = $("#app");
  let DATA = null;
  let collapsed = new Set();       // phase ids currently collapsed (runtime)
  let initedCollapse = false;
  let countdownTimer = null;

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function flash(msg) {
    let f = $(".flash");
    if (!f) { f = document.createElement("div"); f.className = "flash"; document.body.appendChild(f); }
    f.textContent = msg;
    f.classList.add("show");
    clearTimeout(f._t);
    f._t = setTimeout(() => f.classList.remove("show"), 1400);
  }

  // an item is "complete" when checked (checkbox) or maxed (tally)
  function itemDone(it) {
    if (it.type === "tally") return Store.getTally(it.id) >= it.count;
    return Store.isChecked(it.id);
  }
  // synthesize a checkbox item for steps that carry no collectibles
  function stepItems(step) {
    if (step.items && step.items.length) return step.items;
    return [{ id: step.id + ":done", cat: "misc", label: "Mark this step done" }];
  }
  function stepDone(step) {
    // ref (early cross-refs) and task (reminders) are optional — they don't gate completion
    return stepItems(step).filter((i) => !i.ref && !i.task).every(itemDone);
  }
  function phaseDone(phase) {
    return phase.steps.every(stepDone);
  }

  // ---------- progress math ----------
  function tallyProgress() {
    // returns { cats: {cat: {v,max}}, overall: {v,max} }
    const cats = {};
    let v = 0, max = 0;
    for (const ph of DATA.phases) {
      for (const st of ph.steps) {
        for (const it of (st.items || [])) {
          if (it.cat === "misc" || it.ref || it.task) continue;   // ref = dup cross-ref; task = reminder (e.g. plant a bean) — neither counts
          const c = cats[it.cat] || (cats[it.cat] = { v: 0, max: 0 });
          if (it.type === "tally") {
            c.max += it.count; max += it.count;
            const got = Math.min(Store.getTally(it.id), it.count);
            c.v += got; v += got;
          } else {
            c.max += 1; max += 1;
            if (Store.isChecked(it.id)) { c.v += 1; v += 1; }
          }
        }
      }
    }
    return { cats, overall: { v, max } };
  }

  // ---------- countdown ----------
  function fmtCountdown(ms) {
    if (ms <= 0) return "IT'S TIME — GO!";
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${h}h ${m}m ${ss}s`;
  }
  function renderCountdown() {
    const wrap = $("#countdown");
    if (!wrap) return;
    const iso = Store.getPref("launchISO");
    const big = $("#cd-big", wrap);
    if (!iso) { big.textContent = "—"; wrap.classList.remove("live"); return; }
    const target = new Date(iso).getTime();
    if (isNaN(target)) { big.textContent = "—"; return; }
    big.textContent = fmtCountdown(target - Date.now());
    wrap.classList.toggle("live", target - Date.now() > 0);
  }

  // ---------- rendering ----------
  function meterBlock(label, v, max, green, cls) {
    const pct = max ? Math.round((v / max) * 100) : 0;
    return `<div class="progress-block ${cls || ""}">
      <div class="progress-row"><span class="progress-label">${esc(label)}</span>
      <span class="progress-num">${v} / ${max}${cls === "overall" ? ` · ${pct}%` : ""}</span></div>
      <div class="progress ${green ? "green" : ""}"><div class="bar" style="width:${pct}%"></div></div>
    </div>`;
  }

  function renderHeader() {
    const p = tallyProgress();
    const cat = (k) => p.cats[k] || { v: 0, max: 0 };
    const catDefs = DATA.categories;
    const order = ["sacred", "dungeon", "equip", "item", "upgrade", "bottle", "fairy", "trade"];
    const stats = order.map((k) => {
      const c = cat(k), full = c.max && c.v >= c.max;
      return `<div class="stat ${full ? "full" : ""}"><span>${catDefs[k].icon} ${esc(catDefs[k].label)}</span><span class="v">${c.v}/${c.max}</span></div>`;
    }).join("");

    const iso = Store.getPref("launchISO") || "";
    return `
    <header class="app-header">
      <div class="title-row">
        <h1>Ocarina of Time — 100% Binge</h1>
        <span class="subtitle">Midnight launch · one sitting</span>
      </div>
      <div class="scope">${esc(DATA.meta.scope)}</div>
    </header>

    <div class="countdown ${iso ? "live" : ""}" id="countdown">
      <span>⏱ Launch countdown:</span>
      <span class="big" id="cd-big">—</span>
      <input type="datetime-local" id="launch-input" value="${esc(iso)}" />
      <span class="muted small">set your midnight drop</span>
    </div>

    <div class="meters">
      ${meterBlock("Overall completion", p.overall.v, p.overall.max, false, "overall")}
      ${meterBlock("♥ Heart Pieces", cat("hearts").v, cat("hearts").max, false)}
      ${meterBlock("🕷 Gold Skulltulas", cat("gs").v, cat("gs").max, true)}
      ${meterBlock("🎵 Songs", cat("song").v, cat("song").max, true)}
    </div>
    <div class="minigrid">${stats}</div>

    <div class="controls">
      <label class="toggle"><input type="checkbox" id="t-hide" ${Store.getPref("hideCompleted") ? "checked" : ""}/> Hide completed steps</label>
      <label class="toggle"><input type="checkbox" id="t-miss" ${Store.getPref("onlyMissable") ? "checked" : ""}/> Only flagged steps</label>
      <div class="controls-right">
        <input class="search" id="search" type="search" placeholder="Search items / locations…" value="${esc(Store.getPref("search") || "")}" />
        <button class="btn" id="btn-export">Export</button>
        <button class="btn" id="btn-import">Import</button>
        <button class="btn danger" id="btn-reset">Reset</button>
      </div>
    </div>`;
  }

  function renderFocus() {
    // first not-done step in route order
    for (const ph of DATA.phases) {
      for (const st of ph.steps) {
        if (!stepDone(st)) {
          return `<div class="focus">
            <div class="lbl">▶ Up next</div>
            <div class="ttl">${esc(st.title)}</div>
            <div class="where">${esc(st.loc || "")}${st.do ? " — " + esc(st.do) : ""}</div>
            <div class="small" style="margin-top:6px"><a id="jump-focus" data-ph="${esc(ph.id)}" data-st="${esc(st.id)}">Jump to it ↓</a></div>
          </div>`;
        }
      }
    }
    return `<div class="focus" style="border-color:var(--done)">
      <div class="lbl" style="color:var(--done)">✔ Done</div>
      <div class="ttl">100% complete — every collectible accounted for. GG. 🗡️</div>
    </div>`;
  }

  function itemRow(it) {
    const done = itemDone(it);
    const pill = `<span class="cat-pill">${esc((DATA.categories[it.cat] || {}).label || it.cat)}</span>`;
    const verify = it.conf === "verify" ? `<span class="verify" title="Confirm in-game">verify</span>` : "";
    if (it.type === "tally") {
      const val = Store.getTally(it.id);
      const full = val >= it.count;
      return `<li class="item ${full ? "checked" : ""}" data-search="${esc((it.label + " " + it.id).toLowerCase())}">
        <span class="txt">${esc(it.label)} ${verify}</span>
        <span style="flex:1"></span>${pill}
        <span class="tally" data-id="${esc(it.id)}" data-max="${it.count}">
          <button class="step-btn" data-d="-1">−</button>
          <span class="val ${full ? "full" : ""}">${val} / ${it.count}</span>
          <button class="step-btn" data-d="1">+</button>
        </span>
      </li>`;
    }
    const newPill = it.added ? `<span class="new-pill" title="Detail added in v0.5.0 — not in the original tracker">new</span>` : "";
    if (it.task) {
      const taskChip = `<span class="task-chip" title="A reminder, not a collectible — it doesn't count toward 100%.">reminder</span>`;
      return `<li class="item ${done ? "checked" : ""} task" data-search="${esc((it.label + " " + it.id).toLowerCase())}">
        <label><input type="checkbox" data-id="${esc(it.id)}" ${done ? "checked" : ""}/>
        <span class="txt">${esc(it.label)} ${newPill}</span></label>${taskChip}
      </li>`;
    }
    if (it.ref) {
      const refChip = `<span class="ref-chip" title="You normally collect this in §${esc(it.refSec)}. Tick it only if you grab or glitch it early — it counts where it's normally collected, never twice.">normally §${esc(it.refSec)}${it.avail ? " · " + esc(it.avail) : ""}</span>`;
      return `<li class="item ${done ? "checked" : ""} ref" data-search="${esc((it.label + " " + it.id).toLowerCase())}">
        <label><input type="checkbox" data-id="${esc(it.id)}" ${done ? "checked" : ""}/>
        <span class="txt">${esc(it.label)}</span></label>${refChip}
      </li>`;
    }
    return `<li class="item ${done ? "checked" : ""} ${it.added ? "added" : ""}" data-search="${esc((it.label + " " + it.id).toLowerCase())}">
      <label><input type="checkbox" data-id="${esc(it.id)}" ${done ? "checked" : ""}/>
      <span class="txt">${esc(it.label)} ${verify} ${newPill}</span></label>${pill}
    </li>`;
  }

  // per-area checkable duplicates — collectibles located here that you normally
  // get in a later section (added v0.5.0; made checkable v0.6.0). Same id as the
  // real item, so checking one here counts at the canonical spot and never twice.
  function areaRefBlock(refs) {
    if (!refs.length) return "";
    const byArea = {};
    refs.forEach((r) => { (byArea[r.area || "Here"] = byArea[r.area || "Here"] || []).push(r); });
    const groups = Object.keys(byArea).map((area) => `
      <div class="ah-group"><div class="ah-area">${esc(area)}</div>
        <ul class="items">${byArea[area].map(itemRow).join("")}</ul>
      </div>`).join("");
    return `<div class="also-here">
      <div class="ah-head"><span class="new-pill">new</span> Also in this area
        <span class="an-sub">— you normally collect these in later sections. Tick one only if you grab or glitch it early; it counts where it's normally collected, never twice.</span></div>
      ${groups}
    </div>`;
  }

  function stepBlock(step) {
    const done = stepDone(step);
    const all = stepItems(step);
    const normal = all.filter((i) => !i.ref);
    const refs = all.filter((i) => i.ref);
    const items = normal.map(itemRow).join("");
    const flags = step.flags || [];
    const legend = (DATA.meta && DATA.meta.flagLegend) || {};
    const chips = flags.map((f) => {
      const L = legend[f] || { icon: "", label: f, desc: "" };
      return `<span class="flag flag-${esc(f)}" title="${esc(L.desc || "")}">${L.icon} ${esc(L.label)}</span>`;
    }).join(" ");
    const isPnr = flags.indexOf("pnr") >= 0;
    const note = step.note ? `<div class="step-note ${isPnr ? "pnr" : ""}">${isPnr ? "⚠️ " : ""}${esc(step.note)}</div>` : "";
    return `<div class="step ${done ? "done" : ""} ${flags.length ? "flagged" : ""} ${isPnr ? "pnr" : ""}" id="step-${esc(step.id)}">
      <div class="step-head"><span class="stitle">${esc(step.title)}</span> ${chips} <span class="step-loc">${esc(step.loc || "")}</span></div>
      ${step.do ? `<div class="step-do">${esc(step.do)}</div>` : ""}
      ${note}
      <ul class="items">${items}</ul>
      ${areaRefBlock(refs)}
    </div>`;
  }

  function phaseBlock(phase) {
    const total = phase.steps.length;
    const doneN = phase.steps.filter(stepDone).length;
    const complete = doneN === total;
    const isCollapsed = collapsed.has(phase.id);
    const eraCls = phase.era.replace("+", "");
    const eraLabel = phase.era.replace("+", " + ");
    const steps = phase.steps.map(stepBlock).join("");
    return `<section class="phase ${complete ? "complete" : ""} ${isCollapsed ? "collapsed" : ""}" id="phase-${esc(phase.id)}">
      <div class="phase-head" data-ph="${esc(phase.id)}">
        <span class="caret">▾</span>
        <h2>${esc(phase.title)}</h2>
        <span class="era ${eraCls}">${esc(eraLabel)}</span>
        <span class="phase-count">${doneN}/${total}${complete ? " ✓" : ""}</span>
      </div>
      <div class="phase-blurb">${esc(phase.blurb || "")}</div>
      <div class="phase-body">${steps}</div>
    </section>`;
  }

  function render() {
    if (!initedCollapse) {
      // first paint: auto-collapse already-complete phases
      for (const ph of DATA.phases) if (phaseDone(ph)) collapsed.add(ph.id);
      initedCollapse = true;
    }
    const phases = DATA.phases.map(phaseBlock).join("");
    elApp_set(`
      ${renderHeader()}
      ${renderFocus()}
      ${phases}
      <footer>
        <strong>Nothing in OoT is permanently missable</strong> — you can swap child/adult and revisit every area until the end. Chips just flag conditions:
        <span class="flag flag-night">🌙 night-only</span>
        <span class="flag flag-prep">🌱 prep ahead</span>
        <span class="flag flag-timed">⏱️ timed · retryable</span>
        <span class="flag flag-child">🧒 child-only</span>
        — and <span class="flag flag-pnr">⚠️ point of no return</span> marks the one real deadline (Ganon's Castle).<br/>
        Mirrors the Zelda Dungeon walkthrough · no plot/boss names. Items with a <span class="new-pill">new</span> pill carry how-to-get details; the dashed “Also in this area” boxes are collectibles you normally get later (tick one only if you grab or glitch it early — it counts at its real spot, never twice).<br/>
        Progress saved locally on this device. Export to back it up.
      </footer>`);
    applyFilters();
    wire();
    renderCountdown();
  }

  function elApp_set(html) { elApp.innerHTML = html; }

  // ---------- filters (no re-render; just toggle visibility) ----------
  function applyFilters() {
    const hide = Store.getPref("hideCompleted");
    const onlyMiss = Store.getPref("onlyMissable");
    const q = (Store.getPref("search") || "").trim().toLowerCase();

    DATA.phases.forEach((ph) => {
      let anyVisible = false;
      ph.steps.forEach((st) => {
        const node = document.getElementById("step-" + st.id);
        if (!node) return;
        let show = true;
        if (hide && stepDone(st)) show = false;
        if (onlyMiss && !(st.flags && st.flags.length)) show = false;
        if (q) {
          const hay = (st.title + " " + (st.loc || "") + " " + (st.do || "") + " " +
            stepItems(st).map((i) => i.label).join(" ")).toLowerCase();
          if (!hay.includes(q)) show = false;
        }
        node.style.display = show ? "" : "none";
        if (show) anyVisible = true;
      });
      const pnode = document.getElementById("phase-" + ph.id);
      if (pnode) pnode.style.display = anyVisible ? "" : "none";
    });
  }

  // ---------- events ----------
  function wire() {
    // launch date
    const li = $("#launch-input");
    if (li) li.addEventListener("change", (e) => { Store.setPref("launchISO", e.target.value); renderCountdown(); });

    // toggles
    $("#t-hide").addEventListener("change", (e) => { Store.setPref("hideCompleted", e.target.checked); applyFilters(); });
    $("#t-miss").addEventListener("change", (e) => { Store.setPref("onlyMissable", e.target.checked); applyFilters(); });
    $("#search").addEventListener("input", (e) => { Store.setPref("search", e.target.value); applyFilters(); });

    // data buttons
    $("#btn-export").addEventListener("click", doExport);
    $("#btn-import").addEventListener("click", doImport);
    $("#btn-reset").addEventListener("click", () => {
      if (confirm("Reset ALL progress? (Your launch date + settings are kept.)")) {
        Store.resetProgress(); initedCollapse = false; collapsed = new Set(); render();
      }
    });

    // phase collapse
    elApp.querySelectorAll(".phase-head").forEach((h) => {
      h.addEventListener("click", () => {
        const id = h.getAttribute("data-ph");
        if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
        document.getElementById("phase-" + id).classList.toggle("collapsed");
      });
    });

    // checkboxes
    elApp.querySelectorAll('.item input[type=checkbox]').forEach((cb) => {
      cb.addEventListener("change", () => {
        Store.setChecked(cb.getAttribute("data-id"), cb.checked);
        softRefresh();
      });
    });

    // tally steppers
    elApp.querySelectorAll(".tally").forEach((t) => {
      const id = t.getAttribute("data-id");
      const max = parseInt(t.getAttribute("data-max"), 10);
      t.querySelectorAll(".step-btn").forEach((b) => {
        b.addEventListener("click", () => {
          const d = parseInt(b.getAttribute("data-d"), 10);
          const v = Store.bumpTally(id, d, max);
          const valEl = t.querySelector(".val");
          valEl.textContent = `${v} / ${max}`;
          valEl.classList.toggle("full", v >= max);
          t.closest(".item").classList.toggle("checked", v >= max);
          softRefresh();
        });
      });
    });

    // focus jump
    const jf = $("#jump-focus");
    if (jf) jf.addEventListener("click", () => {
      const ph = jf.getAttribute("data-ph"), st = jf.getAttribute("data-st");
      collapsed.delete(ph);
      const pn = document.getElementById("phase-" + ph);
      if (pn) pn.classList.remove("collapsed");
      const sn = document.getElementById("step-" + st);
      if (sn) sn.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // update meters/focus/phase-counts without nuking scroll & collapse — full re-render is cheap here
  let refreshPending = false;
  function softRefresh() {
    if (refreshPending) return;
    refreshPending = true;
    const y = window.scrollY;
    requestAnimationFrame(() => {
      refreshPending = false;
      render();
      window.scrollTo({ top: y });   // keep your place while ticking items off
    });
  }

  // ---------- import / export ----------
  function doExport() {
    const blob = new Blob([JSON.stringify(Store.exportState(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "oot100-progress.json"; a.click();
    URL.revokeObjectURL(url);
    flash("Progress exported");
  }
  function doImport() {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/json";
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const ok = Store.importState(JSON.parse(r.result));
          if (ok) { initedCollapse = false; collapsed = new Set(); render(); flash("Progress imported"); }
          else flash("Invalid file");
        } catch (e) { flash("Couldn't read that file"); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  // ---------- boot ----------
  fetch("data/route.json")
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then((data) => {
      DATA = data;
      render();
      countdownTimer = setInterval(renderCountdown, 1000);
    })
    .catch((e) => {
      elApp.innerHTML = `<div class="error">Couldn't load <code>data/route.json</code>.<br/>${esc(e.message)}</div>`;
    });
})();
