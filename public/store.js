/*
 * store.js — persistence layer for the OoT 100% binge tracker.
 *
 * v1: localStorage only (single device, zero backend, works offline — which is
 * exactly what you want for a midnight-launch couch binge with no wifi reliance).
 * The whole app talks to state ONLY through this object, so a future KV/D1
 * cross-device sync layer can be dropped in here without touching app.js
 * (mirrors the xenoblade-100-tracker / pokemon-pack-tracker pattern).
 */
(function () {
  "use strict";

  const KEYS = {
    checked: "oot100:checked",     // array of checkbox item ids
    checkedAt: "oot100:checkedAt", // id -> epoch ms when checked
    tally: "oot100:tally",         // id -> integer (Gold Skulltula area steppers, etc.)
    done: "oot100:done",           // array of phase ids the player has collapsed/finished
    prefs: "oot100:prefs"          // ui preferences object (incl. launch date)
  };

  const DEFAULT_PREFS = {
    hideCompleted: false,    // hide fully-finished steps
    onlyMissable: false,     // show only steps that contain a missable
    collapseDone: true,      // auto-collapse a step once all its items are done
    launchISO: "",           // user-set midnight launch datetime (local), e.g. "2026-11-20T00:00"
    search: ""
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage full / disabled — fail silently, app still works in-memory */
    }
  }

  let checked = new Set(read(KEYS.checked, []));
  let checkedAt = read(KEYS.checkedAt, {}) || {};
  let tally = read(KEYS.tally, {}) || {};
  let done = new Set(read(KEYS.done, []));
  let prefs = Object.assign({}, DEFAULT_PREFS, read(KEYS.prefs, {}));

  const Store = {
    // ---- single checkbox items ----
    isChecked: (id) => checked.has(id),
    setChecked(id, on) {
      if (on) { checked.add(id); checkedAt[id] = Date.now(); }
      else { checked.delete(id); delete checkedAt[id]; }
      write(KEYS.checked, [...checked]);
      write(KEYS.checkedAt, checkedAt);
    },
    toggleChecked(id) {
      const on = !checked.has(id);
      this.setChecked(id, on);
      return on;
    },
    checkedAtOf: (id) => checkedAt[id] || null,

    // ---- tally items (0..max steppers; e.g. Gold Skulltulas per area) ----
    getTally: (id) => tally[id] || 0,
    setTally(id, value) {
      const v = Math.max(0, Math.floor(value || 0));
      if (v === 0) delete tally[id];
      else tally[id] = v;
      write(KEYS.tally, tally);
    },
    bumpTally(id, delta, max) {
      let v = (tally[id] || 0) + delta;
      if (typeof max === "number") v = Math.min(max, v);
      this.setTally(id, v);
      return tally[id] || 0;
    },

    // ---- finished phases (manual collapse) ----
    isDone: (id) => done.has(id),
    setDone(id, on) {
      if (on) done.add(id); else done.delete(id);
      write(KEYS.done, [...done]);
    },

    // ---- preferences ----
    getPref: (k) => prefs[k],
    setPref(k, v) { prefs[k] = v; write(KEYS.prefs, prefs); },

    // ---- backup / restore ----
    exportState() {
      return {
        app: "oot100",
        checked: [...checked], checkedAt, tally, done: [...done], prefs,
        exportedAt: new Date().toISOString()
      };
    },
    importState(obj) {
      if (!obj || typeof obj !== "object") return false;
      checked = new Set(Array.isArray(obj.checked) ? obj.checked : []);
      checkedAt = (obj.checkedAt && typeof obj.checkedAt === "object") ? obj.checkedAt : {};
      tally = (obj.tally && typeof obj.tally === "object") ? obj.tally : {};
      done = new Set(Array.isArray(obj.done) ? obj.done : []);
      prefs = Object.assign({}, DEFAULT_PREFS, obj.prefs || {});
      write(KEYS.checked, [...checked]);
      write(KEYS.checkedAt, checkedAt);
      write(KEYS.tally, tally);
      write(KEYS.done, [...done]);
      write(KEYS.prefs, prefs);
      return true;
    },
    resetProgress() {
      const keepPrefs = Object.assign({}, prefs); // keep launch date + UI prefs
      checked = new Set(); checkedAt = {}; tally = {}; done = new Set();
      write(KEYS.checked, []); write(KEYS.checkedAt, {});
      write(KEYS.tally, {}); write(KEYS.done, []);
      prefs = keepPrefs; write(KEYS.prefs, prefs);
    }
  };

  window.Store = Store;
})();
