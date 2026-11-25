/* Recovery Training PWA. Plain JS, no dependencies. All data in localStorage. */
(function () {
  'use strict';
  var KEY = 'nick-recovery-v1';
  var SEED = window.SEED;
  var R = SEED.rehab;

  // ---------- utils ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(iso) { var p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function diff(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function todayKey() { return keyOf(new Date()); }
  function addDays(iso, n) { var d = parse(iso); d.setDate(d.getDate() + n); return keyOf(d); }
  function fmt(iso, o) { return parse(iso).toLocaleDateString('en-US', o || { weekday: 'short', month: 'short', day: 'numeric' }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v, d) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : d; }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
  var SAFETY = {
    safe: { label: 'Left arm free', cls: 'ok' },
    caution: { label: 'Keep left arm passive', cls: 'warn' },
    avoid: { label: 'Loads left arm', cls: 'bad' }
  };
  var CATS = { quads: 'Quads / squat', hams: 'Hamstrings / hinge', hips: 'Hips / glutes', calves: 'Calves', core: 'Core', push: 'Push (right arm)', pull: 'Pull (right arm)', delts: 'Shoulders (right arm)', arms: 'Arms (right arm)', cardio: 'Cardio', other: 'Other' };
  var KIND_LABEL = { lb: 'Weight × reps', none: 'Reps only', min: 'Minutes' };
  var RISKY = /(push.?up|plank|dip|pull.?up|chin.?up|dead.?lift|rdl|barbell|\bbb\b|smith|two.?(arm|hand)|both (arms|hands)|\brow(s|ing)?\b|rower|hang|farmer|carry|sled|battle|left|bench press|handstand|burpee|muscle.?up|clean|snatch|kettlebell swing|bird.?dog|crawl)/i;

  // ---------- state ----------
  var P = window.PROG;
  var C = window.COACH;
  var RT = window.REST;
  var W = window.WARM;
  var SCHEMA = 9;
  function seedDays() {
    return SEED.days.map(function (d) {
      return { id: d.id, name: d.name, focus: d.focus, weekdays: [], items: d.items.map(function (it) { var x = clone(it); x.id = uid(); return x; }) };
    });
  }
  function seedLibrary() { return clone(SEED.library).map(function (x) { if (x.leftHold == null) x.leftHold = x.safety === 'avoid'; return x; }); }
  function seedState() {
    return {
      v: SCHEMA,
      settings: { surgery: '2026-10-26', checkup: '2026-12-08', cap: 8, step: 5, romTarget: 3, rpeOn: true, restOn: true, restSound: true, warmOn: true },
      library: seedLibrary(),
      days: seedDays(),
      exCfg: {},
      restCfg: {},
      coachNotes: {},
      dayNotes: {},
      logs: {},
      dec8: { checked: {}, answers: '' }
    };
  }
  var PROGRAM_BAK = 'nick-recovery-program-pre-v3';
  // One-time copies of pre-upgrade data. Never overwrites an existing backup.
  function backupPreUpgrade(s, raw) {
    if ((s.v || 1) >= SCHEMA) return;
    if (raw && !localStorage.getItem(KEY + '-pre-v' + SCHEMA)) {
      try { localStorage.setItem(KEY + '-pre-v' + SCHEMA, raw); } catch (e) { /* storage full: skip the copy */ }
    }
    if ((s.v || 1) < 3 && !localStorage.getItem(PROGRAM_BAK)) {
      try {
        localStorage.setItem(PROGRAM_BAK, JSON.stringify({ v: s.v || 1, days: s.days || [], savedAt: new Date().toISOString() }));
      } catch (e) { /* storage full: skip the copy */ }
    }
  }
  // Upgrades any older saved shape in place. Never drops logged data.
  function migrate(s) {
    var from = s.v || 1;
    var b = seedState();
    s.settings = Object.assign({}, b.settings, s.settings || {});
    if (!Array.isArray(s.library)) s.library = b.library;
    var have = {}; s.library.forEach(function (x) { have[x.id] = 1; });
    b.library.forEach(function (x) { if (!have[x.id]) s.library.push(x); });
    s.library.forEach(function (x) { if (x.leftHold == null) x.leftHold = x.safety === 'avoid'; });
    if (!Array.isArray(s.days) || from < 3) s.days = b.days;
    s.days.forEach(function (d) {
      d.weekdays = from < 4 ? [] : (Array.isArray(d.weekdays) ? d.weekdays : []);
      d.items = Array.isArray(d.items) ? d.items : [];
      d.items.forEach(function (it) { if (!it.id) it.id = uid(); });
    });
    // v6: add a short core finisher to each known training day if that day
    // is missing it. Never remove, reorder, or rewrite existing items or logs.
    if (from < 6) {
      var seedById = {};
      b.days.forEach(function (d) { seedById[d.id] = d; });
      var catOf = {};
      (s.library || []).forEach(function (x) { catOf[x.id] = x.cat; });
      var CARDIO = { bike: 1, 'incline-walk': 1, recumbent: 1, stairs: 1 };
      s.days.forEach(function (d) {
        var seed = seedById[d.id];
        if (!seed || !Array.isArray(d.items)) return;
        var have = {};
        d.items.forEach(function (it) { have[it.ex] = 1; });
        var toAdd = [];
        seed.items.forEach(function (it) {
          if (catOf[it.ex] === 'core' && !have[it.ex]) {
            var x = clone(it);
            x.id = uid();
            toAdd.push(x);
          }
        });
        if (!toAdd.length) return;
        var insertAt = d.items.length;
        for (var i = 0; i < d.items.length; i++) {
          if (CARDIO[d.items[i].ex]) { insertAt = i; break; }
        }
        d.items = d.items.slice(0, insertAt).concat(toAdd).concat(d.items.slice(insertAt));
      });
    }
    s.exCfg = s.exCfg && typeof s.exCfg === 'object' ? s.exCfg : {};
    // v7: per-exercise rest overrides (seconds). Defaults come from SEED.rest, so nothing else changes.
    s.restCfg = s.restCfg && typeof s.restCfg === 'object' ? s.restCfg : {};
    // v8: warm-up checklist on each day's log (l.warmup). settings.warmOn defaults on.
    s.logs = s.logs && typeof s.logs === 'object' ? s.logs : {};
    // v9: short coach notes on exercise cards (and optional per-day notes). Seed current
    // recommendations once; never overwrite a note the user already wrote.
    s.coachNotes = s.coachNotes && typeof s.coachNotes === 'object' ? s.coachNotes : {};
    s.dayNotes = s.dayNotes && typeof s.dayNotes === 'object' ? s.dayNotes : {};
    if (from < 9) {
      var COACH_SEEDS = {
        'hip-abd': 'Quick ones \u2014 do these before chest press.',
        'bench-leg-raise': 'Quick ones \u2014 do these before chest press.',
        'bss-r': 'Last set hit 14 \u2014 go 45 lb.'
      };
      Object.keys(COACH_SEEDS).forEach(function (id) {
        if (s.coachNotes[id] == null || !String(s.coachNotes[id]).trim()) s.coachNotes[id] = COACH_SEEDS[id];
      });
    }
    Object.keys(s.logs).forEach(function (k) {
      var l = s.logs[k];
      if (!l || typeof l !== 'object') { delete s.logs[k]; return; }
      l.entries = Array.isArray(l.entries) ? l.entries : [];
      l.entries.forEach(function (en) {
        if (!en.id) en.id = uid();
        if (en.pain == null) en.pain = false;
        en.sets = Array.isArray(en.sets) ? en.sets : [];
        en.sets.forEach(function (st) { st.w = num(st.w, 0); st.r = num(st.r, 0); st.done = !!st.done; });
      });
      l.habits = l.habits || {};
      if (l.feel == null) l.feel = '';
    });
    s.dec8 = s.dec8 || b.dec8;
    s.v = SCHEMA;
    return s;
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        backupPreUpgrade(parsed, raw);
        var m = migrate(parsed);
        try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* ignore */ }
        return m;
      }
    } catch (e) { console.warn(e); }
    return seedState();
  }
  var state = load();
  var saveTimer = null, IDX = null;
  function save() {
    IDX = null;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Could not save. Storage full?'); }
  }
  function saveSoon() { IDX = null; clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }

  var ui = { tab: 'today', date: todayKey(), sheet: null, editDay: null, histEx: null, histMetric: 'e1rm', libFilter: 'all', libQ: '', open: {}, pop: null };

  // ---------- lookups ----------
  function lib(id) { for (var i = 0; i < state.library.length; i++) if (state.library[i].id === id) return state.library[i]; return null; }
  function day(id) { for (var i = 0; i < state.days.length; i++) if (state.days[i].id === id) return state.days[i]; return null; }
  function exInfo(id, fallback) {
    var e = lib(id);
    return e || { id: id, name: (fallback && fallback.name) || 'Removed exercise', kind: (fallback && fallback.kind) || 'lb', safety: 'caution', notes: '', cat: 'other' };
  }
  function badge(s) { var b = SAFETY[s] || SAFETY.caution; return '<span class="badge ' + b.cls + '">' + b.label + '</span>'; }
  function sessionDayId(iso) {
    var l = state.logs[iso];
    if (l && l.dayId) return l.dayId;
    if (l && l.builtFor && (l.entries || []).some(function (e) { return e.touched; })) return l.builtFor;
    return 'pick';
  }
  function getLog(iso) {
    var l = state.logs[iso];
    if (!l) l = state.logs[iso] = { dayId: null, whoop: 'green', entries: [], rom: 0, habits: {}, note: '', feel: '', sig: '' };
    return l;
  }
  function phaseIndex(pod) { for (var i = 0; i < R.phases.length; i++) if (pod < R.phases[i][3]) return i; return R.phases.length - 1; }
  function itemOf(l, en) { var d = l && day(l.builtFor); return d && en.itemId ? d.items.filter(function (i) { return i.id === en.itemId; })[0] || null : null; }
  function programItem(exId) {
    for (var i = 0; i < state.days.length; i++) for (var j = 0; j < state.days[i].items.length; j++) if (state.days[i].items[j].ex === exId) return state.days[i].items[j];
    return null;
  }

  // ---------- per-exercise progression settings ----------
  var CAT_INC = { quads: 10, hams: 10, hips: 10, calves: 10, core: 5, push: 5, pull: 5, delts: 2.5, arms: 2.5 };
  function cfgOf(exId, item) {
    var ex = exInfo(exId), c = state.exCfg[exId] || {};
    var it = item || programItem(exId), reps = (it && ex.kind !== 'min' && it.reps) || 10;
    var rmin = c.rmin || Math.max(1, reps - 2), rmax = Math.max(rmin, c.rmax || reps + 2);
    var dInc = /\bDB\b|dumbbell/i.test(ex.name) ? 5 : CAT_INC[ex.cat];
    return { rmin: rmin, rmax: rmax, inc: c.inc || dInc || state.settings.step || 5, minInc: c.minInc || 2, lvInc: c.lvInc || 1, custom: !!state.exCfg[exId] };
  }
  function setCfg(exId, k, v) { var cur = cfgOf(exId); var c = state.exCfg[exId] = state.exCfg[exId] || { rmin: cur.rmin, rmax: cur.rmax }; c[k] = v; if (c.rmax < c.rmin) { if (k === 'rmin') c.rmax = c.rmin; else c.rmin = c.rmax; } }
  function leftHold(ex) { return ex.leftHold != null ? !!ex.leftHold : ex.safety === 'avoid'; }
  // rest between sets (seconds, 0 = no timer): the user's override, else the default rule from data.js
  function restDefault(exId) { return SEED.rest.forEx(exInfo(exId)); }
  function restOf(exId) {
    var c = state.restCfg && state.restCfg[exId];
    if (typeof c === 'number' && isFinite(c)) return exInfo(exId).kind === 'min' ? 0 : c;
    return restDefault(exId);
  }
  function stepOf(en) { return en.kind === 'min' ? (cfgOf(en.ex).minInc || 1) : cfgOf(en.ex).inc; }

  // ---------- performance history ----------
  function doneSets(en) { return (en.sets || []).filter(function (s) { return s.done; }); }
  function fmtSet(s, kind) { return kind === 'min' ? s.w + ' min' + (s.lv ? ' L' + s.lv : '') : kind === 'none' ? String(s.r) : (s.w || 0) + '×' + s.r; }
  function setsText(sets, kind) {
    if (!sets.length) return 'No sets logged';
    if (kind === 'min') return sets.map(function (s) { return fmtSet(s, kind); }).join(', ');
    if (kind === 'none') return sets.map(function (s) { return s.r; }).join(', ') + ' reps';
    return sets.map(function (s) { return fmtSet(s, kind); }).join(', ') + ' lb';
  }
  // exercise id -> sessions (oldest first): {date, sets, pain, kind, vol}
  function idx() {
    if (IDX) return IDX;
    IDX = {};
    Object.keys(state.logs).sort().forEach(function (k) {
      (state.logs[k].entries || []).forEach(function (en) {
        var ds = doneSets(en); if (!ds.length && !en.pain) return;
        (IDX[en.ex] = IDX[en.ex] || []).push({ date: k, sets: ds, pain: !!en.pain, kind: en.kind, vol: P.vol(ds, en.kind), id: en.id });
      });
    });
    return IDX;
  }
  function histBefore(exId, iso, kind) { return (idx()[exId] || []).filter(function (h) { return h.date < iso && (!kind || h.kind === kind); }).slice().reverse(); }
  function lastPerf(exId, beforeIso) {
    var h = histBefore(exId, beforeIso).filter(function (x) { return x.sets.length; })[0];
    if (!h) return null;
    return { date: h.date, sets: h.sets, top: Math.max.apply(null, h.sets.map(function (s) { return s.w || 0; })), text: setsText(h.sets, h.kind), kind: h.kind };
  }
  function suggestFor(exId, item, whoop, iso, nSets) {
    var ex = exInfo(exId);
    return P.suggest({ kind: ex.kind, hist: histBefore(exId, iso, ex.kind), cfg: cfgOf(exId, item), item: item, nSets: nSets, whoop: whoop,
      safety: ex.safety, leftHold: leftHold(ex), cap: state.settings.cap });
  }
  function entryItem(l, en) {
    var it = itemOf(l, en);
    if (it && it.ex === en.ex) return it;
    var s0 = en.sets[0] || { w: 0, r: 10 };
    return { sets: en.sets.length || 3, reps: s0.r || 10, load: s0.w || 0 };
  }
  // PR labels for every set of an entry logged on iso
  function entryPRs(en, iso) {
    var hs = histBefore(en.ex, iso, en.kind).filter(function (h) { return h.sets.length; });
    var prior = [], vols = hs.map(function (h) { return h.vol; });
    hs.forEach(function (h) { prior = prior.concat(h.sets); });
    var before = [], volBefore = 0;
    return en.sets.map(function (s) {
      if (!s.done) return [];
      var volNow = volBefore + P.vol([s], en.kind);
      var pr = P.detectPRs({ kind: en.kind, prior: prior, priorVols: vols, before: before, set: s, volNow: volNow, volBefore: volBefore });
      before = before.concat([s]); volBefore = volNow;
      return pr;
    });
  }
  function weekStart(iso) { return addDays(iso, -((parse(iso).getDay() + 6) % 7)); }
  function weekStats(iso) {
    var a = weekStart(iso), b = addDays(a, 6), pa = addDays(a, -7);
    var o = { start: a, vol: 0, volPrev: 0, prs: 0, sessions: 0, rom: 0, planned: 0, romTarget: (state.settings.romTarget || 3) * 7 };
    Object.keys(state.logs).forEach(function (k) {
      var l = state.logs[k], inW = k >= a && k <= b, inP = k >= pa && k < a;
      if (!inW && !inP) return;
      var v = 0, any = false;
      (l.entries || []).forEach(function (en) {
        var ds = doneSets(en); if (!ds.length) return; any = true;
        if (en.kind === 'lb') v += P.vol(ds, 'lb');
        if (inW) entryPRs(en, k).forEach(function (p) { if (p.length) o.prs++; });
      });
      if (inW) { o.vol += v; o.rom += l.rom || 0; if (any) o.sessions++; } else o.volPrev += v;
    });
    return o;
  }
  function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }

  // ---------- Whoop scaling ----------
  var WHOOP = {
    green: { lead: 'Green: push for progress', tone: 'ok', body: 'Full sets. Each lift shows today\u2019s target from last time: add a rep or add weight. Left arm stays pain-free and under the cap.' },
    yellow: { lead: 'Yellow: repeat last time', tone: 'warn', body: 'One fewer set on most lifts (min 2). Same weights and reps as last time, no increases. Leave 2\u20133 reps in reserve.' },
    red: { lead: 'Red: keep it easy', tone: 'bad', body: 'About half the sets, weights ~10% lighter, cardio ~60%. Or skip the lifts and do 20\u201330 min easy bike or incline walk plus ROM. Skip intensity.' }
  };
  function scaledSets(it, whoop, kind) {
    var sets = it.sets || 3;
    if (kind === 'min') return 1;
    if (whoop === 'yellow') sets = Math.max(2, sets - 1);
    if (whoop === 'red') sets = Math.max(1, Math.ceil(sets * 0.5));
    return sets;
  }
  function makeEntry(it, whoop, iso) {
    var ex = exInfo(it.ex);
    var n = scaledSets(it, whoop, ex.kind);
    var sg = suggestFor(it.ex, it, whoop, iso, n);
    var sets = [];
    if (ex.kind === 'min') sets.push({ w: sg.mins, r: 0, lv: sg.lv || 0, done: false });
    else for (var i = 0; i < n; i++) sets.push({ w: ex.kind === 'none' ? 0 : sg.w, r: sg.repLo || sg.reps[i], done: false });
    return { id: uid(), itemId: it.id, ex: it.ex, name: ex.name, kind: ex.kind, note: it.note || '', sets: sets, notes: '', touched: false, pain: false };
  }
  function sigOf(d, whoop) { return whoop + '|' + JSON.stringify(d.items.map(function (i) { return [i.id, i.ex, i.sets, i.reps, i.load, i.note]; })); }
  function ensureSession(iso) {
    var dayId = sessionDayId(iso);
    if (dayId === 'rest' || dayId === 'pick') return null;
    var d = day(dayId), l = getLog(iso);
    if (!d) return l.entries.length ? l : null;
    var items = orderItems(d.items, dayId, iso);
    var sig = sigOf(d, l.whoop) + '|ord:' + items.map(function (it) { return it.id; }).join(',');
    var anyTouched = l.entries.some(function (e) { return e.touched; });
    if (l.builtFor !== dayId || (!anyTouched && l.sig !== sig)) {
      l.entries = items.map(function (it) { return makeEntry(it, l.whoop, iso); });
      l.builtFor = dayId; l.sig = sig; save();
    } else {
      // keep untouched cards in sync with the latest history, settings, and Whoop color
      var changed = false;
      l.entries = l.entries.map(function (en) {
        if (en.touched) return en;
        var it = itemOf(l, en); if (!it) return en;
        var ne = makeEntry(Object.assign({}, it, { ex: en.ex }), l.whoop, iso);
        if (JSON.stringify(ne.sets) === JSON.stringify(en.sets) && ne.kind === en.kind) return en;
        ne.id = en.id; ne.notes = en.notes; changed = true; return ne;
      });
      if (l.sig !== sig) { l.sig = sig; changed = true; }
      if (changed) save();
    }
    return l;
  }
  function applyWhoop(iso, w) { var l = getLog(iso); l.whoop = w; save(); ensureSession(iso); }

  // carry a changed weight/reps forward to later, not-yet-done sets that still matched the old value
  function setVal(en, si, f, v) {
    var old = en.sets[si][f];
    en.sets[si][f] = v;
    for (var k = si + 1; k < en.sets.length; k++) { var x = en.sets[k]; if (!x.done && x[f] === old) x[f] = v; }
    en.touched = true;
  }
  function bump(en, si, f, dir) {
    var st = en.sets[si];
    if (f === 'w') setVal(en, si, 'w', clamp(Math.round(((st.w || 0) + dir * stepOf(en)) * 100) / 100, 0, 2000));
    else if (f === 'lv') setVal(en, si, 'lv', clamp(Math.round(((st.lv || 0) + dir * (cfgOf(en.ex).lvInc || 1)) * 100) / 100, 0, 100));
    else setVal(en, si, 'r', clamp((st.r || 0) + dir, 0, 200));
  }

  // ---------- rendering helpers ----------
  function stepper(field, val, ei, si, unit, step) {
    var lb = step ? String(step) : '';
    return '<div class="step"><button data-act="dec" data-f="' + field + '" data-e="' + ei + '" data-s="' + si + '" aria-label="minus ' + lb + '">−' + (lb ? '<small>' + lb + '</small>' : '') + '</button>' +
      '<div class="mid"><input inputmode="decimal" enterkeyhint="done" data-field="set" data-f="' + field + '" data-e="' + ei + '" data-s="' + si + '" value="' + esc(val == null ? 0 : val) + '" aria-label="' + unit + '"><span class="u">' + unit + '</span></div>' +
      '<button data-act="inc" data-f="' + field + '" data-e="' + ei + '" data-s="' + si + '" aria-label="plus ' + lb + '">+' + (lb ? '<small>' + lb + '</small>' : '') + '</button></div>';
  }
  var BEAT = { '1': ['up', '▲ Beat last'], '0': ['eq', '= Matched last'], '-1': ['down', '▼ Under last'] };
  function setRow(en, st, si, ei, ctx) {
    var kind = en.kind, inner = '';
    if (kind === 'lb') inner = stepper('w', st.w, ei, si, 'lb', stepOf(en)) + stepper('r', st.r, ei, si, 'reps');
    else if (kind === 'min') inner = stepper('w', st.w, ei, si, 'min', stepOf(en)) + stepper('lv', st.lv || 0, ei, si, 'level');
    else inner = stepper('r', st.r, ei, si, 'reps');
    var open = ui.open[en.id] === si;
    var meta = '';
    var lastSet = ctx.last ? ctx.last.sets[Math.min(si, ctx.last.sets.length - 1)] : null;
    if (st.done) {
      var bt = P.beat(kind, st, lastSet);
      if (bt != null) meta += '<span class="beat ' + BEAT[bt][0] + '">' + BEAT[bt][1] + '</span>';
      (ctx.prs[si] || []).forEach(function (p) { meta += '<span class="pr' + (ui.pop === en.id + ':' + si ? ' pop' : '') + '">🏆 ' + esc(p.label) + '</span>'; });
      if (state.settings.rpeOn && kind !== 'min') {
        if (open || (si === ctx.lastDone && !st.rpe)) {
          meta += '<span class="rpe"><span class="muted">RPE</span>' + [6, 7, 8, 9, 10].map(function (v) {
            return '<button class="' + (st.rpe === v ? 'on' : '') + '" data-act="rpe" data-e="' + ei + '" data-s="' + si + '" data-v="' + v + '">' + v + '</button>';
          }).join('') + '</span>';
        } else if (st.rpe) meta += '<button class="rpe-tag" data-act="sopen" data-e="' + ei + '" data-s="' + si + '">RPE ' + st.rpe + '</button>';
      }
    } else if (si === ctx.firstUndone || open) {
      if (lastSet) meta += '<span class="muted">Last: ' + esc(fmtSet(lastSet, kind)) + '</span>';
      if (si > 0) meta += '<button class="mini-btn" data-act="copyprev" data-e="' + ei + '" data-s="' + si + '">Copy set ' + si + '</button>';
      if (en.sets.slice(si + 1).some(function (x) { return !x.done; })) meta += '<button class="mini-btn" data-act="fillrest" data-e="' + ei + '" data-s="' + si + '">Apply to rest</button>';
    }
    return '<div class="set' + (st.done ? ' done' : '') + '"><div class="set-main"><button class="sn" data-act="sopen" data-e="' + ei + '" data-s="' + si + '" aria-label="Set ' + (si + 1) + ' options">' + (si + 1) + '</button>' + inner +
      '<button class="tick" data-act="sdone" data-e="' + ei + '" data-s="' + si + '" aria-label="Set done">✓</button></div>' +
      (meta ? '<div class="meta">' + meta + '</div>' : '') + '</div>';
  }
  function targetText(sg, kind, c) {
    if (kind === 'min') return sg.mins + ' min' + (sg.lv ? ' · level ' + sg.lv : '');
    var same = sg.reps.every(function (r) { return r === sg.reps[0]; });
    var lo = same ? (sg.repLo || sg.reps[0]) : 0;
    var reps = (same && sg.repHi && sg.repHi > lo) ? lo + '–' + sg.repHi : (same ? String(sg.reps[0]) : sg.reps.join('/'));
    return (kind === 'lb' ? (sg.w || sg.action !== 'start' ? sg.w + ' lb × ' : 'your weight × ') : '') + reps + ' reps · ' + sg.reps.length + (sg.reps.length === 1 ? ' set' : ' sets') + ' <span class="muted">(range ' + c.rmin + '–' + c.rmax + ')</span>';
  }
  var ARROW = { weight: '↑', rep: '↑', minutes: '↑', level: '↑', sets: '↑', tempo: '↑', hold: '→', repeat: '→', cap: '■', blocked: '■', pain: '■', deload: '↓', red: '↓', start: '•' };
  function entryCard(en, ei, iso, l) {
    var ex = exInfo(en.ex, en), c = cfgOf(en.ex, itemOf(l, en));
    var last = lastPerf(en.ex, iso);
    var dn = doneSets(en).length, all = en.sets.length > 0 && dn === en.sets.length;
    var note = en.note || ex.notes;
    var capOver = ex.kind === 'lb' && leftHold(ex) && en.sets.some(function (s) { return s.w > state.settings.cap; });
    var dayIdForSkip = workoutIdOf(l) || sessionDayId(iso);
    var skipNudge = skippedLastTime(en.ex, dayIdForSkip, iso);
    var skipEarly = skipStreak(en.ex, dayIdForSkip, iso) >= 2;
    var coachNote = coachNoteOf(en.ex);
    var sg = suggestFor(en.ex, entryItem(l, en), l.whoop, iso, ex.kind === 'min' ? 1 : en.sets.length || 1);
    var ctx = { last: last && last.kind === en.kind ? last : null, prs: entryPRs(en, iso), lastDone: -1, firstUndone: -1 };
    en.sets.forEach(function (s, i) { if (s.done) ctx.lastDone = i; else if (ctx.firstUndone < 0) ctx.firstUndone = i; });
    var why = sg.why + (ex.safety === 'caution' && (sg.action === 'weight' || sg.action === 'level') ? ' Only if the left arm stays fully passive.' : '');
    return '<div class="card ex' + (all ? ' done' : '') + (ex.safety === 'avoid' || en.pain ? ' flag' : '') + '" id="ex-' + esc(en.id) + '">' +
      '<div class="ex-head"><button class="check' + (all ? ' on' : '') + '" data-act="edone" data-e="' + ei + '" aria-label="Mark exercise done">' + (all ? '✓' : '') + '</button>' +
      '<div class="grow"><div class="ex-name">' + esc(ex.name) + '</div>' + badge(ex.safety) +
      (skipEarly ? ' <span class="badge warn skip-early">skipped 2x \u2014 do it early</span>' : '') + '</div>' +
      '<button class="btn sm icon" data-act="adjust" data-e="' + ei + '" aria-label="Adjust targets and progression"><svg viewBox="0 0 24 24" class="ico"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg></button>' +
      '<button class="btn sm ghost" data-act="swap" data-e="' + ei + '">Swap</button></div>' +
      (ex.safety === 'avoid' ? '<div class="callout bad"><b>Loads the left arm</b>Not until your surgeon clears it. Tap Swap for a safe option.</div>' : '') +
      (capOver ? '<div class="callout bad">Over your ' + state.settings.cap + ' lb left-arm cap.</div>' : '') +
      (note ? '<p class="muted small">' + esc(note) + '</p>' : '') +
      (coachNote ? '<div class="callout info coach-note">' + esc(coachNote) + '</div>' : '') +
      (skipNudge ? '<div class="callout warn">' + esc(C.skipNudge(ex.kind, sg)) + '</div>' : '') +
      '<div class="tgt ' + sg.tone + '"><div class="tgt-top"><span class="tag ' + sg.tone + '">' + (ARROW[sg.action] || '') + ' ' + esc(sg.label) + '</span>' +
      '<span class="tgt-v"><span class="muted">Today:</span> ' + targetText(sg, ex.kind, c) + '</span></div>' +
      '<div class="small why">' + esc(why) + '</div>' +
      '<div class="small lastline">' + (last ? 'Last time (' + fmt(last.date, { month: 'short', day: 'numeric' }) + '): <b>' + esc(last.text) + '</b>' : '<span class="muted">No history yet</span>') +
      (last ? ' <a href="#" data-act="trend" data-x="' + esc(en.ex) + '">Trend</a>' : '') + '</div></div>' +
      '<div class="sets">' + en.sets.map(function (s, si) { return setRow(en, s, si, ei, ctx); }).join('') + '</div>' +
      '<div class="row"><button class="btn sm" data-act="addset" data-e="' + ei + '">+ Set</button>' +
      '<button class="btn sm" data-act="delset" data-e="' + ei + '"' + (en.sets.length <= 1 ? ' disabled' : '') + '>− Set</button>' +
      '<span class="grow"></span><button class="btn sm pain' + (en.pain ? ' on' : '') + '" data-act="pain" data-e="' + ei + '" aria-pressed="' + (en.pain ? 'true' : 'false') + '">' + (en.pain ? '⚠ Pain flagged' : '⚠ Pain') + '</button>' +
      '<button class="btn sm icon ghost danger" data-act="delentry" data-e="' + ei + '" aria-label="Remove from today">✕</button></div>' +
      (en.pain ? '<div class="callout bad"><b>Pain or discomfort flagged</b>No progression on this one next time. Stop it if the pain is sharp. Stop and call your surgeon for: ' + esc(R.redFlags.join(', ').toLowerCase()) + '.</div>' : '') +
      '<textarea class="note" rows="1" placeholder="Notes (how it felt, machine settings…)" data-field="enote" data-e="' + ei + '">' + esc(en.notes) + '</textarea>' +
      '</div>';
  }
  function weekCard(iso) {
    var w = weekStats(iso);
    var dv = w.volPrev ? Math.round((w.vol - w.volPrev) / w.volPrev * 100) : null;
    return '<div class="wk"><div><b>' + fmtNum(w.vol) + '</b><span>lb volume' + (dv == null ? '' : ' <em class="' + (dv >= 0 ? 'up' : 'down') + '">' + (dv >= 0 ? '+' : '') + dv + '%</em>') + '</span></div>' +
      '<div><b>' + w.prs + '</b><span>PRs</span></div>' +
      '<div><b>' + w.sessions + '</b><span>Sessions</span></div>' +
      '<div><b>' + w.rom + '/' + w.romTarget + '</b><span>ROM</span></div></div>' +
      '<p class="small muted wk-cap">Week of ' + fmt(w.start, { month: 'short', day: 'numeric' }) + (w.volPrev ? ' · last week ' + fmtNum(w.volPrev) + ' lb' : '') + '</p>';
  }


  function fmtShort(iso) {
    var d = parse(iso);
    return WD[d.getDay()] + ' ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function ago(iso, from) {
    var n = diff(iso, from || todayKey());
    if (n === 0) return 'today';
    if (n === 1) return '1 day ago';
    if (n > 1) return n + ' days ago';
    if (n === -1) return 'tomorrow';
    return 'in ' + (-n) + ' days';
  }
  function sessionDone(l) {
    return !!(l && (l.entries || []).some(function (e) { return doneSets(e).length; }));
  }
  function workoutIdOf(l) {
    if (!l) return null;
    var id = l.dayId || l.builtFor;
    if (!id || id === 'rest' || id === 'pick') return null;
    return id;
  }
  function lastCompleted(dayId, beforeIso) {
    var last = null;
    Object.keys(state.logs).forEach(function (k) {
      if (beforeIso && k >= beforeIso) return;
      var l = state.logs[k];
      if (workoutIdOf(l) !== dayId || !sessionDone(l)) return;
      if (!last || k > last) last = k;
    });
    return last;
  }
  function skippedLastTime(exId, dayId, beforeIso) {
    var k = lastCompleted(dayId, beforeIso);
    if (!k) return false;
    return skippedInSession(exId, k);
  }
  function skippedInSession(exId, iso) {
    var l = state.logs[iso];
    if (!l) return false;
    var found = false, done = false;
    (l.entries || []).forEach(function (en) {
      if (en.ex !== exId) return;
      found = true;
      if (doneSets(en).length) done = true;
    });
    return found && !done;
  }
  function completedSessions(dayId, beforeIso) {
    var ks = [];
    Object.keys(state.logs).forEach(function (k) {
      if (beforeIso && k >= beforeIso) return;
      var l = state.logs[k];
      if (workoutIdOf(l) !== dayId || !sessionDone(l)) return;
      ks.push(k);
    });
    ks.sort();
    return ks;
  }
  // 2 if this exercise was on, and not done, in both of the last two sessions of this day type.
  function skipStreak(exId, dayId, beforeIso) {
    var ks = completedSessions(dayId, beforeIso);
    if (ks.length < 2) return 0;
    var last2 = ks.slice(-2);
    if (last2.every(function (k) { return skippedInSession(exId, k); })) return 2;
    return 0;
  }
  // Move lifts skipped in the last 2 sessions of this day type to right after the first item
  // (the main compound). Does not rewrite the saved program, only this session's order.
  function orderItems(items, dayId, iso) {
    if (!items || !items.length) return (items || []).slice();
    var early = [], rest = [];
    items.forEach(function (it, i) {
      if (i > 0 && skipStreak(it.ex, dayId, iso) >= 2) early.push(it);
      else rest.push(it);
    });
    if (!early.length) return items.slice();
    if (!rest.length) return early;
    return [rest[0]].concat(early).concat(rest.slice(1));
  }
  function coachNoteOf(exId) {
    var n = state.coachNotes && state.coachNotes[exId];
    return n ? String(n).trim() : '';
  }
  function setCoachNote(exId, text) {
    state.coachNotes = state.coachNotes || {};
    text = String(text || '').trim();
    if (text) state.coachNotes[exId] = text;
    else delete state.coachNotes[exId];
  }
  function nextUp(beforeIso) {
    var best = null, bestDate = null, bestIdx = 999;
    state.days.forEach(function (d, i) {
      var last = lastCompleted(d.id, beforeIso);
      var key = last || '';
      if (best == null || key < bestDate || (key === bestDate && i < bestIdx)) {
        best = d.id; bestDate = key; bestIdx = i;
      }
    });
    return best;
  }
  function recentWorkouts(upToIso, limit) {
    limit = limit || 5;
    var out = [];
    Object.keys(state.logs).sort().reverse().forEach(function (k) {
      if (upToIso && k > upToIso) return;
      var l = state.logs[k];
      var id = workoutIdOf(l);
      if (!id || !sessionDone(l)) return;
      var entries = (l.entries || []).filter(function (e) { return doneSets(e).length; });
      var nsets = entries.reduce(function (a, e) { return a + doneSets(e).length; }, 0);
      var vol = entries.reduce(function (a, e) { return a + (e.kind === 'lb' ? P.vol(doneSets(e), 'lb') : 0); }, 0);
      var d = day(id);
      var top = null;
      entries.forEach(function (e) {
        if (e.kind !== 'lb') return;
        doneSets(e).forEach(function (s) {
          if (!top || s.w > top.w || (s.w === top.w && s.r > top.r)) top = { name: exInfo(e.ex, e).name, w: s.w, r: s.r };
        });
      });
      out.push({ date: k, dayId: id, name: (d && d.name) || 'Workout', nsets: nsets, nex: entries.length, vol: vol, top: top, whoop: l.whoop || 'green' });
    });
    return out.slice(0, limit);
  }
  function recentSummary(r) {
    var parts = [r.nsets + (r.nsets === 1 ? ' set' : ' sets')];
    if (r.vol) parts.push(fmtNum(r.vol) + ' lb');
    if (r.top) parts.push(r.top.name + ' ' + r.top.w + '\u00d7' + r.top.r);
    return parts.join(' \u00b7 ');
  }
  function lastAnySession(beforeIso) {
    var last = null;
    Object.keys(state.logs).forEach(function (k) {
      if (beforeIso && k >= beforeIso) return;
      if (!sessionDone(state.logs[k])) return;
      if (!last || k > last) last = k;
    });
    return last;
  }
  function workoutSummaryData(iso) {
    var l = state.logs[iso];
    if (!sessionDone(l)) return null;
    var id = workoutIdOf(l), d = id ? day(id) : null, last = lastAnySession(iso);
    var exercises = [], skipped = [], nexts = [];
    (l.entries || []).forEach(function (en) {
      var ds = doneSets(en), ex = exInfo(en.ex, en);
      var it = itemOf(l, en) || entryItem(l, en);
      var n = ex.kind === 'min' ? 1 : Math.max((it && it.sets) || 0, en.sets.length, 1);
      if (!ds.length && !en.pain) {
        skipped.push(ex.name);
        var skipSg = suggestFor(en.ex, it, 'green', addDays(iso, 1), n);
        skipSg.skippedLast = true;
        nexts.push(C.compactTarget(ex.name, en.kind, skipSg));
        return;
      }
      var sg = suggestFor(en.ex, it, l.whoop || 'green', iso, n);
      var prs = [];
      entryPRs(en, iso).forEach(function (p) { p.forEach(function (x) { if (prs.indexOf(x.label) < 0) prs.push(x.label); }); });
      var vs = ds.length ? (C.vsTarget(en.kind, ds, sg) || 'hit') : 'missed';
      exercises.push({
        name: ex.name, kind: en.kind,
        setsLine: C.formatSets(en.kind, ds),
        targetLine: vs === 'baseline' ? '' : C.formatTarget(en.kind, sg),
        vs: vs,
        prs: prs, pain: !!en.pain, notes: (en.notes || '').trim()
      });
      if (ds.length) nexts.push(C.compactTarget(ex.name, en.kind, suggestFor(en.ex, it, 'green', addDays(iso, 1), n)));
    });
    return {
      dateLabel: fmtShort(iso), name: (d && d.name) || 'Workout', whoop: l.whoop || 'green',
      lastSession: last ? { ago: ago(last, iso), dateLabel: fmtShort(last) } : null,
      exercises: exercises, skipped: skipped, feel: (l.feel || '').trim(), notes: (l.note || '').trim(),
      rom: { done: !!(l.rom), count: l.rom || 0, target: state.settings.romTarget || 3 },
      warmup: warmupLine(l),
      nextLine: nexts.join('; ')
    };
  }
  function workoutSummary(iso) { var o = workoutSummaryData(iso); return o ? C.formatWorkout(o) : 'No workout logged on this day.'; }
  function weeklySummaryData(iso) {
    iso = iso || todayKey();
    var start = addDays(iso, -6), prevStart = addDays(iso, -13), prevEnd = addDays(iso, -7);
    var sessions = [], vol = 0, sets = 0, volPrev = 0, setsPrev = 0, sessionsPrev = 0;
    var prs = [], pain = [], missed = [], romDays = 0, romSessions = 0, doneIds = {};
    function consume(k, l, inCurr) {
      var entries = l.entries || [], lifting = false, nsets = 0, v = 0;
      entries.forEach(function (en) {
        var ds = doneSets(en); if (!ds.length && !en.pain) return;
        if (ds.length) { lifting = true; nsets += ds.length; if (en.kind === 'lb') v += P.vol(ds, 'lb'); }
        if (!inCurr) return;
        var ex = exInfo(en.ex, en);
        if (en.pain) pain.push({ name: ex.name, dateLabel: fmtShort(k) });
        if (ds.length) {
          var it = itemOf(l, en) || entryItem(l, en);
          var n = en.kind === 'min' ? 1 : Math.max((it && it.sets) || 0, en.sets.length, 1);
          var sg = suggestFor(en.ex, it, l.whoop || 'green', k, n);
          if (C.vsTarget(en.kind, ds, sg) === 'missed') missed.push({ name: ex.name, dateLabel: fmtShort(k) });
          entryPRs(en, k).forEach(function (p) { p.forEach(function (x) {
            var lab = ex.name + ' ' + x.label; if (prs.indexOf(lab) < 0) prs.push(lab);
          }); });
        }
      });
      if (inCurr) {
        if (l.rom) { romDays++; romSessions += l.rom; }
        if (lifting) {
          var id = workoutIdOf(l); if (id) doneIds[id] = 1;
          sessions.push({ date: k, dateLabel: fmtShort(k), name: (id && day(id) && day(id).name) || 'Workout' });
          vol += v; sets += nsets;
        }
      } else if (lifting) { sessionsPrev++; volPrev += v; setsPrev += nsets; }
    }
    Object.keys(state.logs).sort().forEach(function (k) {
      var l = state.logs[k];
      if (k >= start && k <= iso) consume(k, l, true);
      else if (k >= prevStart && k <= prevEnd) consume(k, l, false);
    });
    var toChk = diff(iso, state.settings.checkup);
    var chkName = fmt(state.settings.checkup, { month: 'short', day: 'numeric' });
    var checkupLine = toChk > 0 ? toChk + ' days to ' + chkName + ' checkup' : toChk === 0 ? 'Checkup is today (' + chkName + ').' : 'Checkup date (' + chkName + ') has passed.';
    var notDone = state.days.filter(function (d) { return !doneIds[d.id]; }).map(function (d) { return d.name; });
    return {
      rangeLabel: fmtShort(start) + ' \u2013 ' + fmtShort(iso), checkupLine: checkupLine,
      sessions: sessions, sessionsPrev: sessionsPrev, vol: vol, volPrev: volPrev, sets: sets, setsPrev: setsPrev,
      prs: prs, pain: pain, missed: missed, romDays: romDays, romSessions: romSessions, days: 7, notDone: notDone
    };
  }
  function weeklySummary(iso) { return C.formatWeekly(weeklySummaryData(iso)); }
  function tryCopy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select();
      try {
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) resolve(); else reject(new Error('copy failed'));
      } catch (e) { document.body.removeChild(ta); reject(e); }
    });
  }
  function shareTitle(kind, iso) {
    if (kind === 'week') return 'Recovery week';
    var l = state.logs[iso], id = workoutIdOf(l), d = id ? day(id) : null;
    return 'Recovery \u2014 ' + ((d && d.name) || 'workout') + ' \u2014 ' + fmtShort(iso);
  }
  function copyText(text, title) {
    tryCopy(text).then(function () { toast('Copied \u2014 paste it to Recovery Coach', 3200); }).catch(function () {
      openSheet({ type: 'share', title: title || 'Send to Coach', text: text });
    });
  }
  function shareCoach(kind, iso) {
    iso = iso || ui.date;
    var text = kind === 'week' ? weeklySummary(iso) : workoutSummary(iso);
    if (!text || text.indexOf('No workout logged') === 0) { toast('Nothing to send yet.'); return; }
    var title = shareTitle(kind, iso);
    if (typeof navigator.share === 'function') {
      try {
        var p = navigator.share({ title: title, text: text });
        if (p && typeof p.then === 'function') {
          p.then(function () {}).catch(function (e) {
            if (e && e.name === 'AbortError') return;
            copyText(text, title);
          });
          return;
        }
      } catch (err) { /* fall through */ }
    }
    copyText(text, title);
  }
  function finishCard(iso, l, allDone) {
    return '<div class="card finish-card">' +
      '<h3>' + (allDone ? 'Workout complete' : 'Send this session') + '</h3>' +
      '<p class="muted small">' + (allDone ? 'Nice work. Add how it felt, then send a recap to your coach.' : 'You can send what\u2019s logged so far, or finish the rest of the sets first.') + '</p>' +
      '<label class="f">How did it feel?<textarea rows="2" placeholder="Energy, left arm, anything your coach should know\u2026" data-field="feel">' + esc((l && l.feel) || '') + '</textarea></label>' +
      '<button type="button" class="btn pri block coach" data-act="sendcoach" data-k="' + esc(iso) + '">Send to Coach</button></div>';
  }


  function warmupState(l) {
    if (!l.warmup || typeof l.warmup !== 'object') l.warmup = { cardio: false, dynamic: false, rom: false, ramp: false, romLogged: false };
    return l.warmup;
  }
  function warmupLine(l) {
    if (!l) return '';
    var wu = l.warmup || {};
    var n = W.IDS.filter(function (k) { return wu[k]; }).length;
    if (!state.settings.warmOn && n === 0) return '';
    return W.line(n, W.IDS.length);
  }
  function firstLiftEntry(l) {
    var list = (l && l.entries) || [], i;
    for (i = 0; i < list.length; i++) if (list[i] && list[i].kind === 'lb') return list[i];
    for (i = 0; i < list.length; i++) if (list[i] && list[i].kind !== 'min') return list[i];
    return list[0] || null;
  }
  function firstLiftTarget(l, iso) {
    var en = firstLiftEntry(l);
    if (!en) return { name: 'your first lift', w: 0, inc: 5 };
    var w = 0;
    if (en.kind === 'lb' && en.sets && en.sets[0] && +en.sets[0].w) w = +en.sets[0].w;
    if (!w) {
      var it = itemOf(l, en) || entryItem(l, en);
      var n = Math.max((it && it.sets) || 0, (en.sets && en.sets.length) || 1);
      var sg = suggestFor(en.ex, it, (l && l.whoop) || 'green', iso || ui.date, n);
      w = +(sg && sg.w) || 0;
    }
    return { name: (exInfo(en.ex, en) || en).name, w: w, inc: cfgOf(en.ex).inc || 5 };
  }
  function warmupCard(iso, l, d) {
    if (!state.settings.warmOn) return '';
    var wu = warmupState(l);
    var exs = (l.entries || []).map(function (en) { return exInfo(en.ex, en); });
    var tgt = firstLiftTarget(l, iso);
    var items = W.items(d, exs, { targetW: tgt.w, inc: tgt.inc, liftName: tgt.name });
    var n = items.filter(function (it) { return wu[it.id]; }).length;
    var all = n === items.length && items.length;
    var h = '<div class="card warmup-card' + (all ? ' done' : '') + '"><details' + (all ? '' : ' open') + '>' +
      '<summary class="warmup-sum"><div class="grow"><b>Warm-up</b><div class="muted small">' +
      (all ? 'Done \u2014 you\u2019re ready to work.' : '5\u20138 min, especially when it\u2019s cold. Then the first work set.') +
      '</div></div><span class="muted small">' + n + ' of ' + items.length + '</span></summary>';
    h += '<div class="warmup-list">';
    items.forEach(function (it) {
      var on = !!wu[it.id];
      h += '<button type="button" class="warmup-item' + (on ? ' on' : '') + '" data-act="warm" data-k="' + it.id + '">' +
        '<span class="check' + (on ? ' on' : '') + '" aria-hidden="true">' + (on ? '\u2713' : '') + '</span>' +
        '<span class="grow"><b>' + esc(it.title) + '</b><div class="muted small">' + esc(it.detail) + '</div></span></button>';
    });
    return h + '</div></details></div>';
  }

  // ---------- views ----------
  function vToday() {
    var iso = ui.date, s = state.settings, t = todayKey();
    var pod = diff(s.surgery, iso), wk = Math.max(1, Math.ceil(Math.max(pod, 1) / 7)), toChk = diff(iso, s.checkup);
    var pi = phaseIndex(pod), ph = R.phases[pi];
    var existing = state.logs[iso];
    var whoop = (existing && existing.whoop) || 'green';
    var dayId = sessionDayId(iso);
    if (dayId !== 'rest' && dayId !== 'pick' && !day(dayId)) dayId = 'pick';
    var picking = !!ui.picking || dayId === 'pick';
    var h = '';
    h += '<div class="datebar"><button class="btn icon" data-act="date" data-n="-1" aria-label="Previous day">‹</button><div class="d">' +
      (iso === t ? 'Today · ' : '') + fmt(iso) + (iso !== t ? ' <button class="btn sm ghost" data-act="date" data-n="0">Go to today</button>' : '') +
      '</div><button class="btn icon" data-act="date" data-n="1" aria-label="Next day">›</button></div>';
    h += '<div class="stats"><div class="stat"><b>Day ' + pod + '</b><span>Post-op · week ' + wk + '</span></div>' +
      '<div class="stat"><b>' + (toChk > 0 ? toChk + 'd' : toChk === 0 ? 'Today' : 'Done') + '</b><span>To ' + fmt(s.checkup, { month: 'short', day: 'numeric' }) + ' checkup</span></div>' +
      '<div class="stat"><b>' + ph[0].replace('Weeks ', 'Wk ') + '</b><span>' + (pi === 1 ? 'Motion phase' : pi === 0 ? 'Protect phase' : 'Needs clearance') + '</span></div></div>';
    h += '<h2>This week</h2>' + weekCard(iso);
    if (toChk <= 0) h += '<div class="callout warn"><b>Checkup date reached</b>Keep the ' + s.cap + ' lb cap until you apply what was cleared. Update limits under More.</div>';
    h += '<div class="callout bad"><b>Left arm: pain-free ROM, ≤ ' + s.cap + ' lb</b>No gripping, pushing, pulling, bracing, or hanging with the left. Stop and call your surgeon for sharp pain, a pop, new swelling, or numbness. <a href="#" data-act="tab" data-t="rehab">Rehab details</a></div>';

    var rec = recentWorkouts(iso, 5);
    h += '<div class="heading-row"><h2>Recent workouts</h2><button type="button" class="btn sm" data-act="sendweek" data-k="' + esc(iso) + '">Weekly summary</button></div>';
    if (!rec.length) h += '<div class="card"><p class="muted">No workouts logged yet. When you finish a session, it shows up here.</p></div>';
    else h += rec.map(function (r) {
      return '<button class="recent-card" data-act="recent" data-k="' + esc(r.date) + '"><div class="grow"><div class="nm">' + esc(r.name) + '</div>' +
        '<div class="muted small">' + esc(fmtShort(r.date)) + ' \u00b7 ' + esc(ago(r.date, iso)) + '</div>' +
        '<div class="muted small">' + esc(recentSummary(r)) + '</div></div><span class="muted">\u203a</span></button>';
    }).join('');

    if (picking) {
      var nxt = nextUp(iso), nd = nxt ? day(nxt) : null;
      h += '<h2>Choose a workout</h2>';
      if (nd) h += '<p class="muted small">Next up: <b>' + esc(nd.name) + '</b> (done least recently). Pick any workout you want.</p>';
      h += '<div class="pick-grid">';
      state.days.forEach(function (d) {
        var last = lastCompleted(d.id, iso);
        var isNext = d.id === nxt;
        var sub = last ? 'Last: ' + fmtShort(last) + ' \u00b7 ' + ago(last, iso) : 'Not done yet';
        h += '<button type="button" class="workout-card' + (isNext ? ' next' : '') + '" data-act="pickwo" data-d="' + esc(d.id) + '"' + (isNext ? ' data-next="1"' : '') + '>' +
          '<div class="row between"><div class="nm">' + esc(d.name) + '</div>' + (isNext ? '<span class="tag ok">Next up</span>' : '') + '</div>' +
          '<div class="muted small">' + d.items.length + ' exercises \u00b7 ' + esc(sub) + '</div></button>';
      });
      h += '<button type="button" class="workout-card rest" data-act="pickwo" data-d="rest"><div class="nm">Rest / ROM day</div>' +
        '<div class="muted small">No lifting. Optional easy walk or hands-free bike, plus your ROM sessions.</div></button>';
      if (ui.picking && dayId !== 'pick') h += '<button type="button" class="btn ghost block" data-act="pickcancel">Keep current workout</button>';
      h += '</div>';
    } else if (dayId === 'rest') {
      h += '<div class="card"><h3>Rest / ROM day</h3><p class="muted">Optional easy walk or hands-free bike, plus your ROM sessions below. No lifting needed.</p>' +
        '<button class="btn sm" data-act="changewo">Choose a workout instead</button></div>';
    } else {
      h += '<h2>Whoop recovery</h2><div class="seg">' + ['green', 'yellow', 'red'].map(function (w) {
        return '<button class="' + w[0] + (whoop === w ? ' on' : '') + '" data-act="whoop" data-w="' + w + '">' + w[0].toUpperCase() + w.slice(1) + '</button>';
      }).join('') + '</div><div class="callout ' + WHOOP[whoop].tone + '"><b>' + WHOOP[whoop].lead + '</b>' + WHOOP[whoop].body + '</div>';
      var l = ensureSession(iso), d = day(dayId) || { name: 'Deleted session', focus: '' };
      if (!l) h += '<div class="card"><p class="muted">This session no longer exists. <button class="btn sm" data-act="changewo">Pick a workout</button></p></div>';
      else {
        var exDone = l.entries.filter(function (e) { return e.sets.length && doneSets(e).length === e.sets.length; }).length;
        var dayCoach = ((state.dayNotes || {})[d.id] || '').trim();
        h += '<div class="card"><div class="row between"><h3>' + esc(d.name) + '</h3><span class="muted small">' + exDone + '/' + l.entries.length + ' done</span></div><p class="muted small">' + esc(d.focus || '') + '</p>' +
          (dayCoach ? '<div class="callout info">' + esc(dayCoach) + '</div>' : '') +
          '<div class="row wrap" style="margin-top:8px"><button class="btn sm" data-act="addentry">+ Exercise today</button><button class="btn sm ghost" data-act="rebuild">Reset session</button><span class="grow"></span><button class="btn sm" data-act="changewo">Change workout</button></div></div>';
        h += warmupCard(iso, l, d);
        h += l.entries.map(function (en, ei) { return entryCard(en, ei, iso, l); }).join('');
        if (sessionDone(l)) {
          var allDone = l.entries.every(function (e) { return e.sets.length && doneSets(e).length === e.sets.length; });
          h += finishCard(iso, l, allDone);
        }
      }
    }

    var rom = (existing && existing.rom) || 0, tgt = s.romTarget || 3, hab = (existing && existing.habits) || {};
    var dots = ''; for (var i = 0; i < Math.max(tgt, rom); i++) dots += '<i class="' + (i < rom ? 'on' : '') + '"></i>';
    h += '<h2>Rehab today</h2><div class="card"><div class="row between"><div><b>Left-arm ROM</b><div class="muted small">' + rom + ' of ' + tgt + ' sessions \u00b7 5\u201310 min, pain-free</div></div><div class="rom-dots">' + dots + '</div></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn pri grow" data-act="rom" data-n="1">+ Did a ROM session</button><button class="btn" data-act="rom" data-n="-1"' + (rom ? '' : ' disabled') + ' aria-label="Undo ROM session">Undo</button></div>' +
      '<p class="small muted" style="margin-top:8px">ROM is never progressed in load. Go by comfort: a little more range, less stiffness, no pain.</p>' +
      '<div class="chips" style="margin-top:10px">' + R.habits.map(function (x) { return '<button class="chip' + (hab[x[0]] ? ' on' : '') + '" data-act="habit" data-k="' + x[0] + '">' + (hab[x[0]] ? '\u2713 ' : '') + esc(x[1]) + '</button>'; }).join('') + '</div></div>';
    var note = (existing && existing.note) || '';
    h += '<h2>Day notes</h2><textarea rows="2" placeholder="Arm feel, swelling, sleep, anything to tell the surgeon\u2026" data-field="dnote">' + esc(note) + '</textarea>';
    return h;
  }

  function miniStep(lbl, act, d, i, val) {
    return '<div class="step"><span class="lbl">' + lbl + '</span><button data-act="' + act + '" data-dir="-1" data-d="' + esc(d) + '" data-i="' + i + '">−</button>' +
      '<input inputmode="decimal" data-field="pnum" data-k="' + act + '" data-d="' + esc(d) + '" data-i="' + i + '" value="' + esc(val) + '"><button data-act="' + act + '" data-dir="1" data-d="' + esc(d) + '" data-i="' + i + '">+</button></div>';
  }
  function vProgram() {
    var h = '<p class="muted small">Your workouts. Edit exercises here. On Today, pick the one you\u2019re doing \u2014 they are not tied to a weekday. Changes save automatically and apply to new sessions.</p>';
    state.days.forEach(function (d, di) {
      var open = ui.editDay === d.id;
      h += '<div class="card"><div class="row"><div class="grow"><h3>' + esc(d.name) + '</h3><div class="muted small">' + d.items.length + ' exercises</div></div>' +
        '<button class="btn icon sm" data-act="dmove" data-d="' + esc(d.id) + '" data-dir="-1"' + (di === 0 ? ' disabled' : '') + ' aria-label="Move up">↑</button>' +
        '<button class="btn icon sm" data-act="dmove" data-d="' + esc(d.id) + '" data-dir="1"' + (di === state.days.length - 1 ? ' disabled' : '') + ' aria-label="Move down">↓</button>' +
        '<button class="btn sm' + (open ? ' pri' : '') + '" data-act="dedit" data-d="' + esc(d.id) + '">' + (open ? 'Done' : 'Edit') + '</button></div>';
      if (!open) {
        h += '<ul class="list" style="margin-top:8px">' + d.items.map(function (it) {
          var ex = exInfo(it.ex);
          return '<li class="item-row"><span class="grow">' + esc(ex.name) + (ex.safety === 'avoid' ? ' <span class="badge bad">Loads left arm</span>' : '') + '</span><span class="muted small">' + presc(it, ex) + '</span></li>';
        }).join('') + '</ul>';
      } else {
        h += '<label class="f">Name<input type="text" data-field="dname" data-d="' + esc(d.id) + '" value="' + esc(d.name) + '"></label>' +
          '<label class="f">Focus / cues<textarea rows="2" data-field="dfocus" data-d="' + esc(d.id) + '">' + esc(d.focus || '') + '</textarea></label>' +
          '<label class="f">Coach note for this day<textarea rows="2" data-field="daycoach" data-d="' + esc(d.id) + '" placeholder="Optional reminder at the top of this workout">' + esc((state.dayNotes || {})[d.id] || '') + '</textarea></label>';
        h += '<ul class="list">' + d.items.map(function (it, i) {
          var ex = exInfo(it.ex);
          var steps = ex.kind === 'min' ? miniStep('min', 'pload', d.id, i, it.load)
            : miniStep('sets', 'psets', d.id, i, it.sets) + miniStep('start reps', 'preps', d.id, i, it.reps) + (ex.kind === 'lb' ? miniStep('lb', 'pload', d.id, i, it.load) : '');
          return '<li><div class="item-row"><div class="grow"><b>' + esc(ex.name) + '</b><br>' + badge(ex.safety) + '</div>' +
            '<button class="btn icon sm" data-act="imove" data-d="' + esc(d.id) + '" data-i="' + i + '" data-dir="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move up">↑</button>' +
            '<button class="btn icon sm" data-act="imove" data-d="' + esc(d.id) + '" data-i="' + i + '" data-dir="1"' + (i === d.items.length - 1 ? ' disabled' : '') + ' aria-label="Move down">↓</button></div>' +
            (ex.safety === 'avoid' ? '<div class="callout bad">Loads the left arm. Swap it until you are cleared.</div>' : '') +
            '<div class="mini">' + steps + '</div>' +
            '<div class="muted small" style="margin-top:6px">' + (ex.kind === 'min' ? 'Goal ' + it.load + ' min' : 'Range ' + presc(it, ex).split('×')[1].split(' @')[0] + ' reps' + (ex.kind === 'lb' ? ' · +' + cfgOf(it.ex, it).inc + ' lb steps' : '')) + '</div>' +
            '<div class="row" style="margin-top:8px"><button class="btn sm" data-act="pswap" data-d="' + esc(d.id) + '" data-i="' + i + '">Swap</button>' +
            '<button class="btn sm" data-act="pcfg" data-d="' + esc(d.id) + '" data-i="' + i + '">Progression</button>' +
            '<span class="grow"></span><button class="btn sm ghost danger" data-act="idel" data-d="' + esc(d.id) + '" data-i="' + i + '">Remove</button></div></li>';
        }).join('') + '</ul>' +
          '<div class="row wrap" style="margin-top:10px"><button class="btn pri sm" data-act="padd" data-d="' + esc(d.id) + '">+ Add exercise</button><span class="grow"></span>' +
          '<button class="btn sm ghost danger" data-act="ddel" data-d="' + esc(d.id) + '">Delete workout</button></div>';
      }
      h += '</div>';
    });
    h += '<div class="row" style="margin-top:6px"><button class="btn block" data-act="dadd">+ Add workout</button></div>';

    // library
    h += '<h2>Exercise library</h2><div class="card">' +
      '<input type="text" placeholder="Search exercises" data-field="libq" value="' + esc(ui.libQ) + '">' +
      '<div class="chips" style="margin-top:8px">' + [['all', 'All'], ['safe', 'Left arm free'], ['caution', 'Passive left'], ['avoid', 'Loads left'], ['custom', 'Custom']].map(function (f) {
        return '<button class="chip' + (ui.libFilter === f[0] ? ' on' : '') + '" data-act="libf" data-f="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div><div id="liblist">' + libList() + '</div>' +
      '<button class="btn block" style="margin-top:10px" data-act="custom">+ Custom exercise</button></div>';
    h += '<div class="row" style="margin-top:14px"><button class="btn ghost danger block" data-act="resetprog">Reset program to the original plan</button></div>';
    return h;
  }
  function libList() {
    var q = ui.libQ.toLowerCase();
    var items = state.library.filter(function (x) {
      if (ui.libFilter === 'custom' && !x.custom) return false;
      if (['safe', 'caution', 'avoid'].indexOf(ui.libFilter) >= 0 && x.safety !== ui.libFilter) return false;
      return !q || x.name.toLowerCase().indexOf(q) >= 0;
    });
    if (!items.length) return '<p class="muted">No matches.</p>';
    var groups = {};
    items.forEach(function (x) { (groups[x.cat] = groups[x.cat] || []).push(x); });
    return Object.keys(CATS).filter(function (c) { return groups[c]; }).map(function (c) {
      return '<h2 style="margin-left:0">' + CATS[c] + '</h2><ul class="list">' + groups[c].map(function (x) {
        return '<li class="item-row"><div class="grow"><b>' + esc(x.name) + '</b>' + (x.custom ? ' <span class="muted small">custom</span>' : '') + '<br>' + badge(x.safety) +
          ' <span class="muted small">' + KIND_LABEL[x.kind] + '</span>' + (x.notes ? '<div class="muted small">' + esc(x.notes) + '</div>' : '') + '</div>' +
          (x.custom ? '<button class="btn sm ghost danger" data-act="libdel" data-x="' + esc(x.id) + '">Delete</button>' : '') + '</li>';
      }).join('') + '</ul>';
    }).join('');
  }
  function presc(it, ex) {
    if (ex.kind === 'min') return it.load + ' min';
    var c = cfgOf(it.ex, it), rr = c.rmin + '–' + c.rmax;
    if (ex.kind === 'none') return it.sets + '×' + rr;
    return it.sets + '×' + rr + (it.load ? ' @ ' + it.load + ' lb' : '');
  }

  // history
  function meaningful(l) {
    return (l.rom > 0) || (l.note && l.note.trim()) || (l.entries || []).some(function (e) { return e.touched || doneSets(e).length; }) ||
      Object.keys(l.habits || {}).some(function (k) { return l.habits[k]; });
  }
  function metricOf(en, m) {
    var ds = doneSets(en); if (!ds.length) return null;
    if (en.kind === 'min') return m === 'lv' ? Math.max.apply(null, ds.map(function (s) { return s.lv || 0; })) : ds.reduce(function (a, s) { return a + (s.w || 0); }, 0);
    if (en.kind === 'none') return m === 'vol' ? P.vol(ds, 'none') : Math.max.apply(null, ds.map(function (s) { return s.r || 0; }));
    if (m === 'reps') return Math.max.apply(null, ds.map(function (s) { return s.r || 0; }));
    if (m === 'vol') return P.vol(ds, 'lb');
    if (m === 'e1rm') return Math.round(Math.max.apply(null, ds.map(function (s) { return P.epley(s.w, s.r); })) * 10) / 10;
    return Math.max.apply(null, ds.map(function (s) { return s.w || 0; }));
  }
  var METRICS = {
    lb: [['e1rm', 'Est. 1RM', 'lb'], ['vol', 'Volume', 'lb×reps'], ['top', 'Top weight', 'lb'], ['reps', 'Best reps', 'reps']],
    none: [['reps', 'Best reps', 'reps'], ['vol', 'Total reps', 'reps']],
    min: [['min', 'Minutes', 'min'], ['lv', 'Level', 'level']]
  };
  function chart(points, unit) {
    if (!points.length) return '<p class="muted">Finish some sets of this exercise to see a chart.</p>';
    var W = 320, H = 170, L = 40, Rr = 12, T = 14, B = 26;
    var ys = points.map(function (p) { return p.y; });
    var mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys);
    if (mn === mx) { mn = mn - 1 < 0 ? 0 : mn - 1; mx = mx + 1; }
    var t0 = parse(points[0].x).getTime(), t1 = parse(points[points.length - 1].x).getTime(); if (t1 === t0) t1 = t0 + 864e5;
    function X(p) { return points.length === 1 ? (L + (W - L - Rr) / 2) : L + (parse(p.x).getTime() - t0) / (t1 - t0) * (W - L - Rr); }
    function Y(v) { return T + (1 - (v - mn) / (mx - mn)) * (H - T - B); }
    var path = points.map(function (p, i) { return (i ? 'L' : 'M') + X(p).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Progress chart">';
    s += '<line class="ax" x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - Rr) + '" y2="' + (H - B) + '"/><line class="ax" x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '"/>';
    s += '<text x="' + (L - 4) + '" y="' + (T + 4) + '" text-anchor="end">' + Math.round(mx) + '</text><text x="' + (L - 4) + '" y="' + (H - B) + '" text-anchor="end">' + Math.round(mn) + '</text>';
    s += '<text x="' + L + '" y="' + (H - 8) + '">' + fmt(points[0].x, { month: 'short', day: 'numeric' }) + '</text>';
    if (points.length > 1) s += '<text x="' + (W - Rr) + '" y="' + (H - 8) + '" text-anchor="end">' + fmt(points[points.length - 1].x, { month: 'short', day: 'numeric' }) + '</text>';
    s += '<text x="' + (L + 4) + '" y="' + (T - 2) + '">' + unit + '</text>';
    s += '<path class="ln" d="' + path + '"/>' + points.map(function (p) { return '<circle class="pt" cx="' + X(p).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="3.5"><title>' + p.x + ': ' + p.y + '</title></circle>'; }).join('');
    return s + '</svg>';
  }
  function vHistory() {
    var keys = Object.keys(state.logs).filter(function (k) { return meaningful(state.logs[k]); }).sort().reverse();
    var exSeen = {};
    keys.forEach(function (k) { state.logs[k].entries.forEach(function (e) { if (doneSets(e).length) exSeen[e.ex] = exSeen[e.ex] || e; }); });
    var exIds = Object.keys(exSeen);
    var h = '<h2>This week</h2>' + weekCard(todayKey()) + '<button type="button" class="btn pri block" data-act="sendweek" data-k="' + esc(todayKey()) + '" style="margin:8px 0 14px">Weekly summary</button><h2>Progress</h2><div class="card">';
    if (!exIds.length) h += '<p class="muted">Log a workout and your progress charts show up here.</p>';
    else {
      if (!ui.histEx || exIds.indexOf(ui.histEx) < 0) ui.histEx = exIds[0];
      var kind = exSeen[ui.histEx].kind, ms = METRICS[kind] || METRICS.lb;
      h += '<select data-field="histex">' + exIds.map(function (id) { return '<option value="' + esc(id) + '"' + (id === ui.histEx ? ' selected' : '') + '>' + esc(exInfo(id, exSeen[id]).name) + '</option>'; }).join('') + '</select>';
      var mo = ms.filter(function (o) { return o[0] === ui.histMetric; })[0] || ms[0], m = mo[0];
      h += '<div class="seg sm" style="margin-top:8px">' + ms.map(function (o) { return '<button class="' + (m === o[0] ? 'on' : '') + '" data-act="hmet" data-m="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>';
      var pts = keys.slice().reverse().map(function (k) {
        var best = null; state.logs[k].entries.forEach(function (e) { if (e.ex === ui.histEx && e.kind === kind) { var v = metricOf(e, m); if (v != null && (best == null || v > best)) best = v; } });
        return best == null ? null : { x: k, y: best };
      }).filter(Boolean);
      if (pts.length > 1) {
        var f0 = pts[0].y, f1 = pts[pts.length - 1].y, pct = f0 ? Math.round((f1 - f0) / f0 * 100) : null;
        h += '<p class="small" style="margin-top:8px"><b>' + mo[1] + ':</b> ' + fmtNum(f0) + ' → ' + fmtNum(f1) + ' ' + mo[2] + (pct != null ? ' <span class="' + (pct >= 0 ? 'up' : 'down') + '">(' + (pct >= 0 ? '+' : '') + pct + '%)</span>' : '') + ' since ' + fmt(pts[0].x, { month: 'short', day: 'numeric' }) + '</p>';
      }
      h += '<div style="margin-top:10px">' + chart(pts, mo[2]) + '</div>';
    }
    h += '</div><h2>Log</h2>';
    if (!keys.length) h += '<div class="card"><p class="muted">Nothing logged yet.</p></div>';
    keys.forEach(function (k) {
      var l = state.logs[k];
      var d = l.builtFor ? day(l.builtFor) : null;
      var worked = l.entries.filter(function (e) { return doneSets(e).length || e.pain; });
      var nsets = worked.reduce(function (a, e) { return a + doneSets(e).length; }, 0);
      var prMap = {}, npr = 0; worked.forEach(function (e) { prMap[e.id] = entryPRs(e, k); prMap[e.id].forEach(function (p) { if (p.length) npr++; }); });
      h += '<details class="card hist-day"><summary><span class="wdot ' + (l.whoop || 'green') + '"></span><div class="grow"><b>' + fmt(k) + '</b><div class="muted small">' +
        (worked.length ? esc(d ? d.name : 'Workout') + ' · ' + worked.length + ' exercises · ' + nsets + ' sets' : 'No lifting') + ' · ROM ' + (l.rom || 0) + (npr ? ' · 🏆 ' + npr : '') + '</div></div><span class="muted">›</span></summary>' +
        '<ul class="list" style="margin-top:6px">' + worked.map(function (e) {
          var prs = []; prMap[e.id].forEach(function (p) { p.forEach(function (x) { if (prs.indexOf(x.label) < 0) prs.push(x.label); }); });
          return '<li><b>' + esc(exInfo(e.ex, e).name) + '</b>' + (e.pain ? ' <span class="badge bad">Pain</span>' : '') + '<div class="muted small">' + esc(setsText(doneSets(e), e.kind)) + '</div>' +
            (prs.length ? '<div class="small">' + prs.map(function (x) { return '<span class="pr">🏆 ' + esc(x) + '</span>'; }).join(' ') + '</div>' : '') +
            (e.notes ? '<div class="small">' + esc(e.notes) + '</div>' : '') + '</li>';
        }).join('') + '</ul>' + (l.note ? '<p class="small"><b>Note:</b> ' + esc(l.note) + '</p>' : '') +
        '<button class="btn sm" style="margin-top:8px" data-act="openday" data-k="' + k + '">Open this day</button></details>';
    });
    return h;
  }

  function vRehab() {
    var s = state.settings, iso = todayKey(), pod = diff(s.surgery, iso), pi = phaseIndex(pod);
    var l = state.logs[iso], rom = (l && l.rom) || 0;
    var h = '<div class="callout bad"><b>Stop and call your surgeon</b><ul class="b">' + R.redFlags.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>Don\u2019t train through any of these.</div>';
    h += '<h2>Left-arm ROM · 2–3×/day</h2><div class="card"><p class="muted small">5–10 minutes, pain-free only. Motion, not strengthening. Stay inside the brace and the ' + s.cap + ' lb cap.</p><ol class="steps">' +
      R.rom.map(function (x) { return '<li><b>' + esc(x[0]) + '</b><div class="muted small">' + esc(x[1]) + '</div></li>'; }).join('') + '</ol>' +
      '<p class="small muted">Light left-arm isometrics only if they stay pain-free and clearly inside your surgeon\u2019s guidance. If it hurts, skip them.</p>' +
      '<button class="btn pri block" data-act="rom" data-n="1" data-today="1">+ Log ROM session (' + rom + ' today)</button></div>';
    h += '<h2>Recovery phases</h2><div class="card"><p class="muted small">General typical progression after distal biceps repair, not a personal protocol. Everything after week 6 is pending your surgeon\u2019s clearance.</p>' +
      R.phases.map(function (p, i) {
        var a = addDays(s.surgery, p[2]), b = p[3] < 999 ? addDays(s.surgery, p[3] - 1) : null;
        return '<div class="phase ' + (i === pi ? 'now' : i < pi ? 'done' : '') + '"><span class="dot"></span><div><b>' + p[0] + '</b> <span class="muted small">' + fmt(a, { month: 'short', day: 'numeric' }) + (b ? '–' + fmt(b, { month: 'short', day: 'numeric' }) : '+') + '</span>' +
          (i === pi ? ' <span class="badge ok">You are here</span>' : i >= 2 ? ' <span class="badge warn">Needs clearance</span>' : '') + '<div class="small muted">' + esc(p[1]) + '</div></div></div>';
      }).join('') + '</div>';
    h += '<h2>Until you\u2019re cleared</h2><div class="card"><b>Off limits</b><ul class="b">' + R.offLimits.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<b>Use these</b><ul class="b">' + R.useThese.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    h += '<h2>Recovery habits</h2><div class="card"><ul class="b"><li>Protein: about 1 g per pound of goal bodyweight, spread across the day.</li><li>Sleep: aim for about 8 hours.</li><li>Optional: 15 g collagen plus vitamin C about an hour before a mobility session. Not a substitute for the limits or the checkup.</li></ul></div>';
    h += '<h2>Ask on ' + fmt(s.checkup, { month: 'short', day: 'numeric' }) + '</h2><div class="card">' + R.questions.map(function (q, i) {
      return '<label class="q"><input type="checkbox" data-field="q" data-i="' + i + '"' + (state.dec8.checked[i] ? ' checked' : '') + '><span>' + esc(q) + '</span></label>';
    }).join('') + '<label class="f">What the surgeon said<textarea rows="4" data-field="answers" placeholder="New cap, brace, PT, what\u2019s cleared…">' + esc(state.dec8.answers) + '</textarea></label></div>';
    h += '<p class="small muted">General guidance built around your surgeon\u2019s limits. Not physical therapy or medical advice.</p>';
    return h;
  }

  function vMore() {
    var s = state.settings;
    var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    var h = '<h2>Recovery settings</h2><div class="card">' +
      '<label class="f">Surgery date<input type="date" data-field="setting" data-k="surgery" value="' + s.surgery + '"></label>' +
      '<label class="f">Checkup date<input type="date" data-field="setting" data-k="checkup" value="' + s.checkup + '"></label>' +
      '<label class="f">Left-arm load cap (lb)<input type="number" inputmode="decimal" data-field="setting" data-k="cap" value="' + s.cap + '"></label>' +
      '<label class="f">ROM sessions per day<input type="number" inputmode="numeric" data-field="setting" data-k="romTarget" value="' + s.romTarget + '"></label>' +
      '<label class="f">Default weight step (lb), for exercises without their own<input type="number" inputmode="decimal" data-field="setting" data-k="step" value="' + s.step + '"></label>' +
      '<label class="q" style="border:0"><input type="checkbox" data-field="rpeon"' + (s.rpeOn ? ' checked' : '') + '><span>Ask for RPE (effort 6–10) after each set. Easy sets earn bigger jumps.</span></label>' +
      '<p class="small muted">Only raise the cap after your surgeon clears it.</p></div>';
    h += '<h2>Rest timer</h2><div class="card">' +
      '<label class="q" style="border:0"><input type="checkbox" data-field="reston"' + (s.restOn ? ' checked' : '') + '><span>Start a rest timer when I check off a set</span></label>' +
      '<label class="q" style="border:0"><input type="checkbox" data-field="restsound"' + (s.restSound ? ' checked' : '') + '><span>Beep and vibrate when rest is over</span></label>' +
      '<p class="small muted">Change the rest for any exercise with its Adjust button. Defaults: 2:30 big lower-body lifts and chest press, 1:30 rows and other right-arm compounds, 1:15 isolation, 45–60 s core, none for cardio.</p></div>';
    h += '<h2>Warm-up</h2><div class="card">' +
      '<label class="q" style="border:0"><input type="checkbox" data-field="warmon"' + (s.warmOn ? ' checked' : '') + '><span>Show a checkable warm-up at the top of each session</span></label>' +
      '<p class="small muted">5 min easy cardio (incline walk on leg days, bike on upper days), 1–2 min of dynamic work, a left-arm ROM primer, and 2–3 ramp-up sets on the first lift.</p></div>';
    h += '<h2>Backup</h2><div class="card"><p class="small muted">Everything is stored on this phone only. Export a backup now and then (it saves a .json file you can keep in Files or email to yourself).</p>' +
      '<div class="row"><button class="btn pri grow" data-act="export">Export backup</button><label class="btn grow" for="importfile">Import backup</label></div>' +
      '<input id="importfile" type="file" accept="application/json,.json" data-field="import" hidden></div>';
    if (!standalone) h += '<h2>Install on your phone</h2><div class="card small"><p><b>iPhone (Safari):</b> tap Share, then <b>Add to Home Screen</b>.</p><p><b>Android (Chrome):</b> menu ⋮, then <b>Install app</b>.</p><p class="muted">It then opens full screen and works offline.</p></div>';
    h += '<h2>Data</h2><div class="card"><button class="btn ghost danger block" data-act="wipe">Erase all data on this phone</button></div>';
    h += '<p class="small muted">General training guidance around your surgeon\u2019s limits. Not medical advice. Your surgeon\u2019s instructions always win.</p>';
    return h;
  }

  // ---------- sheets ----------
  function openSheet(sh) { ui.sheet = sh; renderSheet(); }
  function closeSheet() { ui.sheet = null; renderSheet(); render(); }
  function renderSheet() {
    var root = $('#sheet-root'), sh = ui.sheet;
    if (!sh) { root.innerHTML = ''; document.body.style.overflow = ''; return; }
    document.body.style.overflow = 'hidden';
    var body = sh.type === 'custom' ? customForm(sh) : sh.type === 'adjust' ? adjustSheet(sh) : sh.type === 'recent' ? recentSheet(sh) : sh.type === 'share' ? shareSheet(sh) : pickList(sh);
    var open = root.querySelector('.sheet');
    if (open && root.dataset.type === sh.type) { var sc = open.scrollTop; open.innerHTML = '<div class="grab"></div>' + body; open.scrollTop = sc; return; } // update in place, no re-animation
    root.dataset.type = sh.type;
    root.innerHTML = '<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + body + '</div>';
  }
  function recentSheet(sh) {
    var k = sh.date, l = state.logs[k];
    if (!l) return '<div class="sheet-head"><h3>Workout</h3><button class="btn sm" data-act="close">Close</button></div><p class="muted">No log for this day.</p>';
    var id = workoutIdOf(l), d = id ? day(id) : null;
    var entries = (l.entries || []).filter(function (e) { return doneSets(e).length || e.pain; });
    var h = '<div class="sheet-head"><h3>' + esc((d && d.name) || 'Workout') + '</h3><button class="btn sm" data-act="close">Close</button></div>';
    h += '<p class="muted small">' + esc(fmtShort(k)) + ' \u00b7 ' + esc(ago(k)) + (l.whoop ? ' \u00b7 ' + l.whoop : '') + '</p>';
    if (!entries.length) h += '<p class="muted">No sets logged.</p>';
    else h += '<ul class="list">' + entries.map(function (e) {
      return '<li><b>' + esc(exInfo(e.ex, e).name) + '</b>' + (e.pain ? ' <span class="badge bad">Pain</span>' : '') +
        '<div class="muted small">' + esc(setsText(doneSets(e), e.kind)) + '</div>' +
        (e.notes ? '<div class="small">' + esc(e.notes) + '</div>' : '') + '</li>';
    }).join('') + '</ul>';
    if (l.feel) h += '<p class="small"><b>How it felt:</b> ' + esc(l.feel) + '</p>';
    if (l.note) h += '<p class="small"><b>Note:</b> ' + esc(l.note) + '</p>';
    h += '<button type="button" class="btn pri block coach" style="margin-top:12px" data-act="sendcoach" data-k="' + esc(k) + '">Send to Coach</button>';
    h += '<button class="btn block" style="margin-top:8px" data-act="openday" data-k="' + esc(k) + '">Open this day</button>';
    return h;
  }
  function shareSheet(sh) {
    return '<div class="sheet-head"><h3>' + esc(sh.title || 'Send to Coach') + '</h3><button class="btn sm" data-act="close">Close</button></div>' +
      '<p class="muted small">Select the text, copy it, then paste it to Recovery Coach.</p>' +
      '<textarea class="share-text" readonly rows="14">' + esc(sh.text || '') + '</textarea>' +
      '<button type="button" class="btn pri block" style="margin-top:10px" data-act="copytext">Copy</button>';
  }
  function pickList(sh) {
    var current = sh.current ? exInfo(sh.current) : null;
    var title = sh.type === 'swap' ? 'Swap ' + (current ? esc(current.name) : '') : 'Add exercise';
    var q = (sh.q || '').toLowerCase();
    var alts = (sh.alts || []).map(lib).filter(Boolean);
    var altIds = alts.map(function (x) { return x.id; });
    var rest = state.library.filter(function (x) {
      if (x.id === sh.current || altIds.indexOf(x.id) >= 0) return false;
      if (q) return x.name.toLowerCase().indexOf(q) >= 0;
      return sh.all || !current || x.cat === current.cat;
    });
    var rank = { safe: 0, caution: 1, avoid: 2 };
    rest.sort(function (a, b) { return (rank[a.safety] - rank[b.safety]) || a.name.localeCompare(b.name); });
    function row(x) {
      return '<button class="pick" data-act="pick" data-x="' + esc(x.id) + '"><div class="grow"><div class="nm">' + esc(x.name) + '</div>' + badge(x.safety) + ' <span class="muted small">' + (CATS[x.cat] || '') + '</span></div><span class="muted">›</span></button>';
    }
    var h = '<div class="sheet-head"><h3>' + title + '</h3><button class="btn sm" data-act="close">Close</button></div>';
    h += '<input type="text" placeholder="Search library" data-field="sheetq" value="' + esc(sh.q || '') + '">';
    if (sh.ctx === 'session') h += '<label class="q" style="border:0"><input type="checkbox" data-field="alsoprog"' + (sh.alsoProg ? ' checked' : '') + '><span>Also change it in my program</span></label>';
    h += '<div id="picklist">';
    if (alts.length && !q) h += '<h2 style="margin-left:0">Suggested swaps</h2>' + alts.map(row).join('');
    h += '<h2 style="margin-left:0">' + (q ? 'Matches' : sh.all || !current ? 'All exercises' : 'Same muscle group') + '</h2>' + (rest.length ? rest.map(row).join('') : '<p class="muted">No matches.</p>');
    if (!sh.all && current && !q) h += '<button class="btn block" data-act="showall">Show all exercises</button>';
    h += '</div><button class="btn block" style="margin-top:10px" data-act="custom">+ Custom exercise</button>';
    return h;
  }
  function sStep(lbl, act, k, val, unit) {
    return '<div class="arow"><span class="alb">' + lbl + '</span><div class="step big"><button data-act="' + act + '" data-k="' + k + '" data-dir="-1" aria-label="' + lbl + ' minus">−</button>' +
      '<div class="mid"><input inputmode="decimal" data-field="' + act + 'num" data-k="' + k + '" value="' + esc(val) + '" aria-label="' + lbl + '">' + (unit ? '<span class="u">' + unit + '</span>' : '') + '</div>' +
      '<button data-act="' + act + '" data-k="' + k + '" data-dir="1" aria-label="' + lbl + ' plus">+</button></div></div>';
  }
  function chipsFor(k, opts, cur, unit) {
    return '<div class="chips">' + opts.map(function (v) { return '<button class="chip' + (cur === v ? ' on' : '') + '" data-act="cfgset" data-k="' + k + '" data-v="' + v + '">' + v + (unit ? ' ' + unit : '') + '</button>'; }).join('') + '</div>';
  }
  function adjustSheet(sh) {
    var ex = exInfo(sh.ex), c = cfgOf(sh.ex, sh.item), h = '';
    h += '<div class="sheet-head"><h3>' + esc(ex.name) + '</h3><button class="btn sm" data-act="close">Done</button></div>';
    if (sh.ctx === 'session') {
      var v = sh.v;
      h += '<h2 style="margin-left:0">Today’s target</h2><div class="card">' +
        sStep('Sets', 'adj', 'sets', v.sets, '') +
        (ex.kind === 'min' ? sStep('Minutes', 'adj', 'w', v.w, 'min') + sStep('Level', 'adj', 'lv', v.lv || 0, '')
          : sStep('Reps', 'adj', 'r', v.r, '') + (ex.kind === 'lb' ? sStep('Weight', 'adj', 'w', v.w, 'lb') : '')) +
        (sh.hasItem ? '<label class="q" style="border:0"><input type="checkbox" data-field="adjprog"' + (sh.alsoProg ? ' checked' : '') + '><span>Also save as the default in my program</span></label>' : '') +
        '<button class="btn pri block" data-act="adjapply">Apply to sets not done yet</button><p class="small muted">Sets you already checked off stay as logged.</p></div>';
    }
    h += '<h2 style="margin-left:0">Progression for this exercise</h2><div class="card">';
    if (ex.kind !== 'min') {
      h += sStep('Rep range low', 'cfg', 'rmin', c.rmin, '') + sStep('Rep range high', 'cfg', 'rmax', c.rmax, '') +
        '<p class="small muted">' + (ex.kind === 'lb'
          ? 'Add reps until every set hits ' + c.rmax + ', then add weight and drop back to ' + c.rmin + '.'
          : 'Even out to your best set, then add a rep. At higher reps, slow the tempo or hold a light plate with your RIGHT hand only.') + '</p>';
    }
    if (ex.kind === 'lb') {
      h += '<div class="alb" style="margin-top:10px">Weight step (+/− buttons and increases)</div>' + chipsFor('inc', [1, 2.5, 5, 10, 20], c.inc, 'lb') +
        '<label class="q" style="border:0;margin-top:6px"><input type="checkbox" data-field="lefthold"' + (leftHold(ex) ? ' checked' : '') + '><span>Left hand holds this weight. Never suggest more than the ' + state.settings.cap + ' lb cap.</span></label>';
    }
    if (ex.kind === 'min') {
      h += '<div class="alb">Minutes added per session</div>' + chipsFor('minInc', [1, 2, 5], c.minInc, 'min') +
        '<div class="alb" style="margin-top:10px">Level step</div>' + chipsFor('lvInc', [0.5, 1, 2], c.lvInc, '');
    }
    if (ex.safety !== 'safe') h += '<div class="callout ' + (ex.safety === 'avoid' ? 'bad' : 'warn') + '">' + (ex.safety === 'avoid' ? 'Loads the left arm, so it never gets an increase until you’re cleared.' : 'Increases only make sense if the left arm stays fully passive.') + '</div>';
    if (c.custom) h += '<button class="btn sm ghost block" data-act="cfgreset">Reset to defaults</button>';
    h += '</div>';
    h += '<h2 style="margin-left:0">Coach note</h2><div class="card">' +
      '<textarea class="note" rows="2" data-field="coachnote" data-x="' + esc(sh.ex) + '" placeholder="Short reminder on the session card, so you don\u2019t forget.">' + esc(coachNoteOf(sh.ex)) + '</textarea>' +
      '<p class="small muted">Shows on this exercise in the session. Leave blank to hide it.</p></div>';
    return h + restCard(sh.ex);
  }
  function restCard(exId) {
    var ex = exInfo(exId), h = '<h2 style="margin-left:0">Rest between sets</h2><div class="card">';
    if (ex.kind === 'min') return h + '<p class="small muted">No rest timer for timed cardio.</p></div>';
    var cur = restOf(exId), def = restDefault(exId), own = typeof (state.restCfg || {})[exId] === 'number';
    h += sStep('Rest', 'rst', 'rest', cur, 'sec') +
      '<div class="chips" style="margin-top:8px">' + [0, 45, 60, 75, 90, 120, 150, 180].map(function (v) {
        return '<button class="chip' + (cur === v ? ' on' : '') + '" data-act="restset" data-v="' + v + '">' + (v ? RT.label(v) : 'Off') + '</button>';
      }).join('') + '</div>' +
      '<p class="small muted">' + (cur ? 'Timer: ' + RT.label(cur) + ' after each set.' : 'No timer for this exercise.') + ' Default ' + RT.label(def) + '. Saved for this exercise; your logged sets don’t change.</p>' +
      (own ? '<button class="btn sm ghost block" data-act="restreset">Use default (' + RT.label(def) + ')</button>' : '');
    return h + '</div>';
  }
  function customForm(sh) {
    var c = state.settings.cap;
    return '<div class="sheet-head"><h3>Custom exercise</h3><button class="btn sm" data-act="close">Cancel</button></div>' +
      '<div class="callout bad"><b>Check it against your restrictions</b>Left arm: pain-free motion only, nothing over ' + c + ' lb. No gripping, pushing, pulling, bracing, hanging, or body weight on the left arm. No resisted left curls or twisting. If in doubt, pick a machine or right-arm-only version.</div>' +
      '<label class="f">Name<input type="text" id="cx-name" data-field="cxname" placeholder="e.g. Pendulum squat" value="' + esc(sh.name || '') + '"></label>' +
      '<div id="cx-warn"></div>' +
      '<label class="f">Muscle group<select id="cx-cat">' + Object.keys(CATS).map(function (k) { return '<option value="' + k + '">' + CATS[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f">Tracking<select id="cx-kind"><option value="lb">Weight × reps</option><option value="none">Reps only</option><option value="min">Minutes</option></select></label>' +
      '<label class="f">What does the left arm do?<select id="cx-safety"><option value="safe">Nothing, fully out of it</option><option value="caution" selected>Rests or helps balance only, must stay passive</option><option value="avoid">Grips, pushes, pulls, or braces (flag it)</option></select></label>' +
      '<label class="f">Cues / notes<textarea id="cx-notes" rows="2" placeholder="Setup, how to keep the left arm out of it"></textarea></label>' +
      '<button class="btn pri block" data-act="cxsave">Save' + (sh.then ? ' and add' : '') + '</button>';
  }
  function updateCxWarn() {
    var n = ($('#cx-name') || {}).value || '';
    var w = $('#cx-warn'); if (!w) return;
    w.innerHTML = RISKY.test(n) ? '<div class="callout warn"><b>Heads up</b>That name sounds like it could load the left arm. If it does, tag it "Grips, pushes, pulls, or braces" so it gets flagged, or pick a safe swap.</div>' : '';
  }
  function updatePickList() {
    var el = $('#picklist'); if (!el) return;
    var tmp = document.createElement('div'); tmp.innerHTML = pickList(ui.sheet);
    el.innerHTML = tmp.querySelector('#picklist').innerHTML;
  }
  function confirmSafety(x) {
    if (x.safety !== 'avoid') return true;
    return window.confirm(x.name + ' loads the left arm. It goes against your current restrictions (≤ ' + state.settings.cap + ' lb, no gripping/pushing/pulling/bracing on the left) until your surgeon clears it.\n\nAdd it anyway? It will stay flagged.');
  }
  function doPick(xid) {
    var x = lib(xid), sh = ui.sheet; if (!x || !sh) return;
    if (!confirmSafety(x)) return;
    if (sh.type === 'swap' && sh.ctx === 'session') {
      var l = state.logs[ui.date], en = l.entries[sh.e];
      var ne = makeEntry({ id: en.itemId, ex: x.id, sets: x.kind === 'min' ? 1 : (en.kind === 'min' ? 3 : en.sets.length), reps: en.kind === 'min' ? 10 : (en.sets[0] && en.sets[0].r) || 10,
        load: x.kind === 'min' ? (en.kind === 'min' ? en.sets[0].w : 20) : 0, note: '' }, l.whoop, ui.date);
      en.sets = ne.sets; en.pain = false;
      en.ex = x.id; en.name = x.name; en.kind = x.kind; en.note = ''; en.touched = true;
      if (sh.alsoProg) { var d = day(l.builtFor), it = d && d.items.filter(function (i) { return i.id === en.itemId; })[0]; if (it) swapItem(it, x); }
      toast('Swapped to ' + x.name);
    } else if (sh.type === 'swap' && sh.ctx === 'program') {
      var it2 = day(sh.d).items[sh.i]; swapItem(it2, x); toast('Program updated');
    } else if (sh.type === 'add' && sh.ctx === 'program') {
      day(sh.d).items.push(newItem(x)); toast('Added ' + x.name);
    } else if (sh.type === 'add' && sh.ctx === 'session') {
      var lg = getLog(ui.date);
      var ne = makeEntry(newItem(x), lg.whoop, ui.date); ne.itemId = null; ne.touched = true; lg.entries.push(ne); toast('Added ' + x.name);
    }
    save(); closeSheet(); render();
  }
  function swapItem(it, x) {
    var old = it.ex;
    it.alts = [old].concat((it.alts || []).filter(function (a) { return a !== x.id && a !== old; }));
    it.ex = x.id; it.note = '';
    if (x.kind === 'min') { it.sets = 1; it.reps = 1; if (!it.load || exInfo(old).kind !== 'min') it.load = 20; }
    else if (exInfo(old).kind === 'min') { it.sets = 3; it.reps = 10; it.load = 0; }
    else if (x.kind === 'none') it.load = 0;
  }
  function newItem(x) {
    return { id: uid(), ex: x.id, sets: x.kind === 'min' ? 1 : 3, reps: x.kind === 'min' ? 1 : 10, load: x.kind === 'min' ? 20 : 0, note: '', alts: [] };
  }

  // ---------- rest timer ----------
  // Lives in its own key so it never touches the program or history. Timestamp based (Date.now()).
  var TKEY = KEY + '-timer';
  var timer = (function () { try { return JSON.parse(localStorage.getItem(TKEY) || 'null'); } catch (e) { return null; } })();
  var tickT = null, endT = null, audioCtx = null;
  function persistRest() { try { if (timer) localStorage.setItem(TKEY, JSON.stringify(timer)); else localStorage.removeItem(TKEY); } catch (e) { /* ignore */ } }
  function clearRest() { timer = null; persistRest(); renderRest(); }
  function unlockAudio() {
    if (!state.settings.restSound) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }
  function beep() {
    try {
      if (!audioCtx) return;
      var t0 = audioCtx.currentTime;
      [0, 0.22].forEach(function (off) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.16);
        o.connect(g); g.connect(audioCtx.destination); o.start(t0 + off); o.stop(t0 + off + 0.18);
      });
    } catch (e) { /* no sound */ }
  }
  function restAlert() {
    window.__restAlerts = (window.__restAlerts || 0) + 1;
    if (!state.settings.restSound) return;
    try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch (e) { /* ignore */ }
    beep();
  }
  function nextLabel(l, en, si) {
    for (var k = si + 1; k < en.sets.length; k++) if (!en.sets[k].done) return 'Next: set ' + (k + 1) + ' of ' + exInfo(en.ex, en).name;
    var i0 = l.entries.indexOf(en);
    for (var j = 1; j < l.entries.length; j++) {
      var nx = l.entries[(i0 + j) % l.entries.length];
      if (nx.sets.some(function (x) { return !x.done; })) return 'Next: ' + exInfo(nx.ex, nx).name;
    }
    return 'Last set done \u2014 nice work';
  }
  function startRest(iso, l, en, si) {
    if (!state.settings.restOn || en.kind === 'min') return;
    if (iso < addDays(todayKey(), -1) || iso > todayKey()) return; // backfilling an old day: no timer
    var secs = restOf(en.ex); if (!secs) return;
    var ex = exInfo(en.ex, en);
    unlockAudio();
    timer = RT.start({ iso: iso, entryId: en.id, si: si, ex: en.ex, name: ex.name, rom: RT.romEligible(ex), romLogged: false, next: nextLabel(l, en, si) }, secs, Date.now());
    persistRest(); renderRest();
  }
  function stopRestFor(en, si) { if (timer && timer.entryId === en.id && (si == null || timer.si === si)) clearRest(); }
  function restControl(a) {
    if (!timer) return;
    var now = Date.now();
    if (a === 'rskip') { clearRest(); return; }
    if (a === 'rplus') RT.adjust(timer, 30, now);
    else if (a === 'rminus') RT.adjust(timer, -30, now);
    else if (a === 'rpause') { if (!RT.done(timer, now)) RT.toggle(timer, now); }
    else if (a === 'rrom') {
      var l = getLog(timer.iso);
      if (timer.romLogged) { l.rom = Math.max(0, (l.rom || 0) - 1); timer.romLogged = false; toast('ROM session removed'); }
      else { l.rom = (l.rom || 0) + 1; timer.romLogged = true; vibrate(); toast('ROM session ' + l.rom + ' logged'); }
      save(); persistRest(); render(); return;
    }
    persistRest(); renderRest(); restTick();
  }
  function restBarHtml(now) {
    var dn = RT.done(timer, now), pz = !!timer.paused;
    var time = dn ? '+' + RT.clock(RT.overtime(timer, now)) : RT.clock(RT.remaining(timer, now));
    var h = '<div class="rest-bar' + (dn ? ' done' : '') + (pz ? ' paused' : '') + '" role="timer" aria-live="off">' +
      '<div class="rest-prog"><i id="rest-fill" style="width:' + Math.round(RT.progress(timer, now) * 100) + '%"></i></div>' +
      '<div class="rest-top"><div class="rest-time" id="rest-time">' + time + '</div><div class="rest-lbl grow"><b id="rest-head">' +
      (dn ? 'Go \u2014 next set' : pz ? 'Paused' : 'Rest') + '</b><span class="muted small">' + esc(timer.next || timer.name || '') + '</span></div></div>' +
      '<div class="rest-ctl">' +
      '<button class="btn sm" data-act="rminus" aria-label="Minus 30 seconds">\u221230s</button>' +
      '<button class="btn sm" data-act="rplus" aria-label="Plus 30 seconds">+30s</button>' +
      (dn ? '' : '<button class="btn sm" data-act="rpause">' + (pz ? 'Resume' : 'Pause') + '</button>') +
      '<button class="btn sm ' + (dn ? 'pri' : 'ghost') + '" data-act="rskip">' + (dn ? 'Done' : 'Skip') + '</button></div>';
    if (timer.rom && (!dn || timer.romLogged)) {
      h += '<button class="rest-rom' + (timer.romLogged ? ' on' : '') + '" data-act="rrom">' +
        (timer.romLogged ? '\u2713 ROM session logged \u00b7 tap to undo' : esc(RT.ROM_TEXT) + ' <b>Tap when done to log it.</b>') + '</button>';
    }
    return h + '</div>';
  }
  function renderRest() {
    var root = $('#rest-root'); if (!root) return;
    var now = Date.now();
    if (timer && RT.stale(timer, now)) { timer = null; persistRest(); }
    var show = !!(timer && state.settings.restOn && ui.tab === 'today');
    clearTimeout(endT);
    if (!timer) { clearInterval(tickT); tickT = null; }
    if (!show) { root.innerHTML = ''; document.body.classList.remove('has-rest'); document.body.style.removeProperty('--resth'); }
    else {
      root.innerHTML = restBarHtml(now);
      document.body.classList.add('has-rest');
      document.body.style.setProperty('--resth', root.firstChild.offsetHeight + 'px');
    }
    if (timer) {
      if (!tickT) tickT = setInterval(restTick, 250);
      var left = RT.remaining(timer, now);
      if (!timer.paused && left > 0) endT = setTimeout(restTick, left + 20); // fire on time even if the interval is throttled
    }
  }
  function restTick() {
    if (!timer) { renderRest(); return; }
    var now = Date.now();
    if (RT.stale(timer, now)) { clearRest(); return; }
    if (RT.done(timer, now) && !timer.alerted) {
      timer.alerted = true; persistRest();
      // only buzz/beep when it is on time, not when the app reopens long after the rest ended
      if (RT.overtime(timer, now) < 10000) restAlert();
      renderRest(); return;
    }
    var tEl = document.getElementById('rest-time'); if (!tEl) return;
    var dn = RT.done(timer, now);
    tEl.textContent = dn ? '+' + RT.clock(RT.overtime(timer, now)) : RT.clock(RT.remaining(timer, now));
    var f = document.getElementById('rest-fill'); if (f) f.style.width = Math.round(RT.progress(timer, now) * 100) + '%';
    var bar = tEl.closest('.rest-bar');
    if (bar && dn !== bar.classList.contains('done')) renderRest();
  }

  // ---------- render ----------
  var TITLES = { today: 'Today', program: 'Program', history: 'History', rehab: 'Rehab', more: 'More' };
  function render() {
    var v = { today: vToday, program: vProgram, history: vHistory, rehab: vRehab, more: vMore }[ui.tab];
    $('#main').innerHTML = v();
    $('#title').textContent = TITLES[ui.tab];
    var s = state.settings, pod = diff(s.surgery, todayKey());
    $('#sub').textContent = 'Post-op day ' + pod + ' · ' + Math.max(0, diff(todayKey(), s.checkup)) + 'd to checkup';
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.dataset.tab === ui.tab); });
    renderRest();
  }
  var toastT;
  function toast(msg, ms) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, ms || 1800); }
  function vibrate() { if (navigator.vibrate) navigator.vibrate(12); }

  // ---------- events ----------
  document.getElementById('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]'); if (!b) return;
    if (b.dataset.tab === 'today' && ui.tab === 'today') ui.date = todayKey();
    ui.tab = b.dataset.tab;
    render(); window.scrollTo(0, 0);
  });

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var a = t.dataset.act, D = t.dataset;
    if (t.tagName === 'A') e.preventDefault();
    var l, en, d, it, i;
    switch (a) {
      case 'tab': ui.tab = D.t; render(); window.scrollTo(0, 0); return;
      case 'date': ui.date = D.n === '0' ? todayKey() : addDays(ui.date, +D.n); ui.picking = false; render(); return;
      case 'whoop': applyWhoop(ui.date, D.w); render(); return;
      case 'rom': {
        var iso = D.today ? todayKey() : ui.date;
        l = getLog(iso); l.rom = Math.max(0, (l.rom || 0) + (+D.n)); save(); vibrate();
        if (+D.n > 0) toast('ROM session ' + l.rom + ' logged'); render(); return;
      }
      case 'warm': {
        l = getLog(ui.date);
        var wu = warmupState(l), k = D.k, on = !wu[k];
        wu[k] = on;
        if (k === 'rom') {
          if (on && !wu.romLogged) { l.rom = (l.rom || 0) + 1; wu.romLogged = true; vibrate(); toast('ROM session ' + l.rom + ' logged'); }
          else if (!on && wu.romLogged) { l.rom = Math.max(0, (l.rom || 0) - 1); wu.romLogged = false; toast('ROM session removed'); }
        } else vibrate();
        l.warmup = wu; save(); render(); return;
      }
      case 'habit': l = getLog(ui.date); l.habits = l.habits || {}; l.habits[D.k] = !l.habits[D.k]; save(); render(); return;
      case 'inc': case 'dec': {
        if (suppressClick) { suppressClick = false; return; }
        l = state.logs[ui.date]; en = l.entries[+D.e];
        bump(en, +D.s, D.f, a === 'inc' ? 1 : -1);
        saveSoon(); render(); return;
      }
      case 'sdone': {
        l = state.logs[ui.date]; en = l.entries[+D.e]; var s2 = en.sets[+D.s]; s2.done = !s2.done; en.touched = true;
        delete ui.open[en.id];
        save();
        if (s2.done) {
          var prs = entryPRs(en, ui.date)[+D.s] || [];
          if (prs.length) { ui.pop = en.id + ':' + D.s; toast('🏆 ' + prs.map(function (p) { return p.label; }).join(' · ')); if (navigator.vibrate) navigator.vibrate([20, 60, 20, 60, 40]); }
          else vibrate();
        }
        render(); ui.pop = null;
        if (s2.done) startRest(ui.date, l, en, +D.s); else stopRestFor(en, +D.s);
        return;
      }
      case 'rpe': { l = state.logs[ui.date]; en = l.entries[+D.e]; var s3 = en.sets[+D.s], v = +D.v; s3.rpe = s3.rpe === v ? 0 : v; if (!s3.rpe) delete s3.rpe; en.touched = true; delete ui.open[en.id]; save(); render(); return; }
      case 'sopen': { l = state.logs[ui.date]; en = l.entries[+D.e]; if (ui.open[en.id] === +D.s) delete ui.open[en.id]; else ui.open[en.id] = +D.s; render(); return; }
      case 'copyprev': { l = state.logs[ui.date]; en = l.entries[+D.e]; i = +D.s; var pv = en.sets[i - 1], cur = en.sets[i]; if (pv) { cur.w = pv.w; cur.r = pv.r; if (pv.lv != null) cur.lv = pv.lv; en.touched = true; save(); render(); } return; }
      case 'fillrest': { l = state.logs[ui.date]; en = l.entries[+D.e]; i = +D.s; var src = en.sets[i], nf = 0;
        for (var q = i + 1; q < en.sets.length; q++) if (!en.sets[q].done) { en.sets[q].w = src.w; en.sets[q].r = src.r; if (src.lv != null) en.sets[q].lv = src.lv; nf++; }
        en.touched = true; save(); render(); toast('Applied to ' + nf + ' more set' + (nf === 1 ? '' : 's')); return; }
      case 'pain': { l = state.logs[ui.date]; en = l.entries[+D.e]; en.pain = !en.pain; en.touched = true; save(); render(); if (en.pain) toast('Flagged. No progression on this one next time.'); return; }
      case 'trend': ui.histEx = D.x; ui.tab = 'history'; render(); window.scrollTo(0, 0); return;
      case 'adjust': {
        l = state.logs[ui.date]; en = l.entries[+D.e];
        var ref = en.sets.filter(function (z) { return !z.done; })[0] || en.sets[en.sets.length - 1] || { w: 0, r: 10 };
        var pit2 = itemOf(l, en);
        openSheet({ type: 'adjust', ctx: 'session', e: +D.e, ex: en.ex, item: pit2, hasItem: !!(pit2 && pit2.ex === en.ex), alsoProg: false,
          v: { sets: en.sets.length, r: ref.r || 0, w: ref.w || 0, lv: ref.lv || 0 } });
        return;
      }
      case 'pcfg': { d = day(D.d); it = d.items[+D.i]; openSheet({ type: 'adjust', ctx: 'program', ex: it.ex, item: it }); return; }
      case 'adj': {
        var sv = ui.sheet.v, k2 = D.k, dd = +D.dir, ex2 = exInfo(ui.sheet.ex);
        if (k2 === 'sets') sv.sets = clamp(sv.sets + dd, 1, 12);
        else if (k2 === 'r') sv.r = clamp(sv.r + dd, 0, 200);
        else if (k2 === 'lv') sv.lv = clamp(Math.round((sv.lv + dd * cfgOf(ui.sheet.ex).lvInc) * 100) / 100, 0, 100);
        else sv.w = clamp(Math.round((sv.w + dd * (ex2.kind === 'min' ? cfgOf(ui.sheet.ex).minInc : cfgOf(ui.sheet.ex).inc)) * 100) / 100, 0, 2000);
        renderSheet(); return;
      }
      case 'adjapply': {
        var sh2 = ui.sheet, v2 = sh2.v; l = state.logs[ui.date]; en = l.entries[sh2.e]; var ex3 = exInfo(en.ex);
        if (ex3.kind === 'lb' && leftHold(ex3) && v2.w > state.settings.cap && !confirm(v2.w + ' lb is over your ' + state.settings.cap + ' lb left-arm cap. Use it anyway?')) return;
        var out = [], cnt = 0;
        en.sets.forEach(function (z) { if (z.done) out.push(z); });
        var need = Math.max(0, v2.sets - out.length);
        for (cnt = 0; cnt < need; cnt++) out.push({ w: ex3.kind === 'none' ? 0 : v2.w, r: ex3.kind === 'min' ? 0 : v2.r, lv: ex3.kind === 'min' ? v2.lv : undefined, done: false });
        // keep logged sets in their original order, new targets after
        en.sets = out.map(function (z) { if (z.lv === undefined) delete z.lv; return z; });
        en.touched = true;
        if (sh2.alsoProg && sh2.hasItem) { var pi2 = itemOf(l, en); if (pi2) { pi2.sets = v2.sets; if (ex3.kind === 'min') pi2.load = v2.w; else { pi2.reps = v2.r; pi2.load = ex3.kind === 'lb' ? v2.w : 0; } } }
        save(); closeSheet(); render(); toast(sh2.alsoProg && sh2.hasItem ? 'Updated today and your program' : 'Updated today'); return;
      }
      case 'cfg': { var cc = cfgOf(ui.sheet.ex, ui.sheet.item); setCfg(ui.sheet.ex, D.k, clamp(cc[D.k] + (+D.dir), 1, 100)); save(); renderSheet(); render(); return; }
      case 'cfgset': setCfg(ui.sheet.ex, D.k, +D.v); save(); renderSheet(); render(); return;
      case 'cfgreset': delete state.exCfg[ui.sheet.ex]; save(); renderSheet(); render(); return;
      case 'rminus': case 'rplus': case 'rpause': case 'rskip': case 'rrom': restControl(a); return;
      case 'restset': state.restCfg[ui.sheet.ex] = clamp(Math.round(+D.v), 0, 600); save(); renderSheet(); return;
      case 'rst': state.restCfg[ui.sheet.ex] = clamp(restOf(ui.sheet.ex) + 15 * (+D.dir), 0, 600); save(); renderSheet(); return;
      case 'restreset': delete state.restCfg[ui.sheet.ex]; save(); renderSheet(); return;
      case 'edone': {
        l = state.logs[ui.date]; en = l.entries[+D.e]; var all = en.sets.every(function (s) { return s.done; });
        en.sets.forEach(function (s) { s.done = !all; }); en.touched = true; if (!all) vibrate(); save(); render();
        if (!all) startRest(ui.date, l, en, en.sets.length - 1); else stopRestFor(en);
        return;
      }
      case 'addset': l = state.logs[ui.date]; en = l.entries[+D.e]; var lastS = en.sets[en.sets.length - 1] || { w: 0, r: 10 }; en.sets.push({ w: lastS.w, r: lastS.r, done: false }); en.touched = true; save(); render(); return;
      case 'delset': l = state.logs[ui.date]; en = l.entries[+D.e]; if (en.sets.length > 1) en.sets.pop(); en.touched = true; save(); render(); return;
      case 'delentry': l = state.logs[ui.date]; if (confirm('Remove this exercise from today?')) { l.entries.splice(+D.e, 1); l.entries.forEach(function (x) { x.touched = true; }); save(); render(); } return;
      case 'swap': l = state.logs[ui.date]; en = l.entries[+D.e]; var pd = day(l.builtFor), pit = pd && pd.items.filter(function (x) { return x.id === en.itemId; })[0];
        openSheet({ type: 'swap', ctx: 'session', e: +D.e, current: en.ex, alts: pit ? [pit.ex].concat(pit.alts || []).filter(function (x) { return x !== en.ex; }) : [], alsoProg: false }); return;
      case 'addentry': openSheet({ type: 'add', ctx: 'session', all: true }); return;
      case 'rebuild': {
        l = state.logs[ui.date];
        if (l.entries.some(function (x) { return doneSets(x).length; }) && !confirm('Reset this session? Logged sets for this day will be cleared.')) return;
        l.builtFor = null; l.entries = []; delete l.warmup; ensureSession(ui.date); render(); return;
      }
      case 'pick': doPick(D.x); return;
      case 'showall': ui.sheet.all = true; renderSheet(); return;
      case 'close': closeSheet(); return;
      case 'custom': openSheet({ type: 'custom', then: ui.sheet && ui.sheet.type !== 'custom' ? ui.sheet : null }); return;
      case 'cxsave': {
        var name = $('#cx-name').value.trim(); if (!name) { toast('Give it a name'); return; }
        var x = { id: 'c-' + uid(), name: name, cat: $('#cx-cat').value, kind: $('#cx-kind').value, safety: $('#cx-safety').value, notes: $('#cx-notes').value.trim(), custom: true };
        x.leftHold = x.safety === 'avoid';
        if (x.safety !== 'avoid' && RISKY.test(name) && !confirm('"' + name + '" sounds like it may load the left arm. Save it tagged as ' + SAFETY[x.safety].label.toLowerCase() + ' anyway?')) return;
        state.library.push(x); save();
        var then = ui.sheet.then;
        if (then) { ui.sheet = then; doPick(x.id); } else { closeSheet(); toast('Saved to library'); render(); }
        return;
      }
      case 'pickwo': {
        l = getLog(ui.date);
        var hasWork = (l.entries || []).some(function (x) { return doneSets(x).length; });
        var cur = l.dayId || l.builtFor;
        if (hasWork && cur && cur !== D.d && !confirm('Switch workout? Sets you logged for this day will be replaced.')) return;
        ui.picking = false;
        l.dayId = D.d; l.builtFor = null; l.entries = []; l.sig = ''; delete l.warmup;
        save();
        if (D.d !== 'rest') ensureSession(ui.date);
        render(); return;
      }
      case 'changewo': ui.picking = true; render(); return;
      case 'pickcancel': ui.picking = false; render(); return;
      case 'recent': openSheet({ type: 'recent', date: D.k }); return;
      case 'sendcoach': shareCoach('workout', D.k || ui.date); return;
      case 'sendweek': shareCoach('week', D.k || todayKey()); return;
      case 'copytext': {
        var tx = ui.sheet && ui.sheet.text; if (!tx) return;
        tryCopy(tx).then(function () { toast('Copied — paste it to Recovery Coach', 3200); closeSheet(); }).catch(function () { toast('Select the text and copy it', 2500); });
        return;
      }
      // program
      case 'dedit': ui.editDay = ui.editDay === D.d ? null : D.d; render(); return;
      case 'dmove': i = state.days.indexOf(day(D.d)); var j = i + (+D.dir); if (j >= 0 && j < state.days.length) { var tmp = state.days[i]; state.days[i] = state.days[j]; state.days[j] = tmp; save(); render(); } return;
      case 'dadd': { var nd = { id: 'd-' + uid(), name: 'New workout', focus: '', weekdays: [], items: [] }; state.days.push(nd); ui.editDay = nd.id; save(); render(); return; }
      case 'ddel': d = day(D.d); if (confirm('Delete "' + d.name + '"? Past logs stay in History.')) { state.days.splice(state.days.indexOf(d), 1); ui.editDay = null; save(); render(); } return;
      case 'imove': d = day(D.d); i = +D.i; var j2 = i + (+D.dir); if (j2 >= 0 && j2 < d.items.length) { var t2 = d.items[i]; d.items[i] = d.items[j2]; d.items[j2] = t2; save(); render(); } return;
      case 'idel': d = day(D.d); d.items.splice(+D.i, 1); save(); render(); return;
      case 'psets': case 'preps': case 'pload': {
        d = day(D.d); it = d.items[+D.i]; var dirn = +D.dir, ex = exInfo(it.ex);
        if (a === 'psets') it.sets = clamp(it.sets + dirn, 1, 12);
        if (a === 'preps') it.reps = clamp(it.reps + dirn, 1, 100);
        if (a === 'pload') it.load = clamp(Math.round(((it.load || 0) + dirn * (ex.kind === 'min' ? 5 : cfgOf(it.ex, it).inc)) * 100) / 100, 0, 2000);
        save(); render(); return;
      }
      case 'pswap': d = day(D.d); it = d.items[+D.i]; openSheet({ type: 'swap', ctx: 'program', d: D.d, i: +D.i, current: it.ex, alts: it.alts || [] }); return;
      case 'padd': openSheet({ type: 'add', ctx: 'program', d: D.d, all: true }); return;
      case 'libf': ui.libFilter = D.f; render(); return;
      case 'libdel': { var xi = state.library.findIndex(function (z) { return z.id === D.x; }); var used = state.days.some(function (dd) { return dd.items.some(function (ii) { return ii.ex === D.x; }); });
        if (used) { toast('It\u2019s in your program. Remove it there first.'); return; }
        if (xi >= 0 && confirm('Delete this custom exercise?')) { state.library.splice(xi, 1); save(); render(); } return; }
      case 'resetprog': if (confirm('Reset the program and library to the original plan? Your logs are kept.')) { var b = seedState(); state.days = b.days; state.library = b.library.concat(state.library.filter(function (z) { return z.custom; })); save(); render(); toast('Program reset'); } return;
      // history
      case 'hmet': ui.histMetric = D.m; render(); return;
      case 'openday': ui.date = D.k; ui.tab = 'today'; ui.picking = false; closeSheet(); render(); window.scrollTo(0, 0); return;
      // more
      case 'export': exportData(); return;
      case 'wipe': if (confirm('Erase all program, logs, and settings on this phone? Export a backup first if you want to keep them.')) { localStorage.removeItem(KEY); timer = null; persistRest(); state = seedState(); save(); render(); toast('Reset to fresh'); } return;
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target, f = t.dataset && t.dataset.field; if (!f) return;
    var l, D = t.dataset;
    if (f === 'enote') { l = state.logs[ui.date]; l.entries[+D.e].notes = t.value; l.entries[+D.e].touched = true; saveSoon(); }
    else if (f === 'dnote') { l = getLog(ui.date); l.note = t.value; saveSoon(); }
    else if (f === 'feel') { l = getLog(ui.date); l.feel = t.value; saveSoon(); }
    else if (f === 'coachnote') { setCoachNote(D.x || (ui.sheet && ui.sheet.ex), t.value); saveSoon(); }
    else if (f === 'daycoach') { state.dayNotes = state.dayNotes || {}; if (t.value.trim()) state.dayNotes[D.d] = t.value; else delete state.dayNotes[D.d]; saveSoon(); }
    else if (f === 'dname') { day(D.d).name = t.value; saveSoon(); }
    else if (f === 'dfocus') { day(D.d).focus = t.value; saveSoon(); }
    else if (f === 'answers') { state.dec8.answers = t.value; saveSoon(); }
    else if (f === 'libq') { ui.libQ = t.value; $('#liblist').innerHTML = libList(); }
    else if (f === 'sheetq') { ui.sheet.q = t.value; updatePickList(); }
    else if (f === 'cxname') updateCxWarn();
  });
  document.addEventListener('change', function (e) {
    var t = e.target, f = t.dataset && t.dataset.field; if (!f) return;
    var l, D = t.dataset;
    if (f === 'set') {
      l = state.logs[ui.date]; var en = l.entries[+D.e], st = en.sets[+D.s];
      var v = Math.max(0, num(t.value, D.f === 'w' ? st.w : st.r)); setVal(en, +D.s, D.f, D.f === 'w' ? v : Math.round(v));
      save(); render();
    } else if (f === 'adjnum') {
      var sv = ui.sheet.v, nv = Math.max(0, num(t.value, sv[D.k]));
      sv[D.k] = D.k === 'sets' ? clamp(Math.round(nv), 1, 12) : D.k === 'r' ? Math.round(nv) : nv; renderSheet();
    } else if (f === 'cfgnum') {
      setCfg(ui.sheet.ex, D.k, clamp(Math.round(num(t.value, 8)), 1, 100)); save(); renderSheet(); render();
    } else if (f === 'adjprog') { ui.sheet.alsoProg = t.checked; }
    else if (f === 'lefthold') { var lx = lib(ui.sheet.ex); if (lx) { lx.leftHold = t.checked; save(); render(); } }
    else if (f === 'rpeon') { state.settings.rpeOn = t.checked; save(); toast('Saved'); }
    else if (f === 'reston') { state.settings.restOn = t.checked; if (!t.checked) { timer = null; persistRest(); } save(); renderRest(); toast('Saved'); }
    else if (f === 'restsound') { state.settings.restSound = t.checked; if (t.checked) unlockAudio(); save(); toast('Saved'); }
    else if (f === 'warmon') { state.settings.warmOn = t.checked; save(); render(); toast('Saved'); }
    else if (f === 'rstnum') { state.restCfg[ui.sheet.ex] = clamp(Math.round(num(t.value, restOf(ui.sheet.ex))), 0, 600); save(); renderSheet(); }
    else if (f === 'pnum') {
      var it = day(D.d).items[+D.i], v2 = Math.max(0, num(t.value, 0));
      if (D.k === 'psets') it.sets = clamp(Math.round(v2), 1, 12); else if (D.k === 'preps') it.reps = clamp(Math.round(v2), 1, 100); else it.load = v2;
      save(); render();
    } else if (f === 'pickday') {
      l = getLog(ui.date);
      var hasWork = l.entries.some(function (x) { return doneSets(x).length; });
      if (hasWork && !confirm('Switch session? Sets you logged for this day will be replaced.')) { render(); return; }
      l.dayId = t.value; l.builtFor = null; l.entries = []; delete l.warmup; save(); render();
    } else if (f === 'dname' || f === 'dfocus' || f === 'daycoach' || f === 'coachnote') { save(); }
    else if (f === 'q') { state.dec8.checked[+D.i] = t.checked; save(); }
    else if (f === 'histex') { ui.histEx = t.value; render(); }
    else if (f === 'alsoprog') { ui.sheet.alsoProg = t.checked; }
    else if (f === 'setting') {
      var k = D.k, s = state.settings;
      if (k === 'surgery' || k === 'checkup') { if (t.value) s[k] = t.value; }
      else { var n = num(t.value, s[k]); if (k === 'romTarget') n = clamp(Math.round(n), 1, 10); if (k === 'step') n = clamp(n, 0.5, 50); if (k === 'cap' && n > s.cap && !confirm('Only raise the left-arm cap if your surgeon cleared it. Set it to ' + n + ' lb?')) { t.value = s.cap; return; } s[k] = n; }
      save(); render(); toast('Saved');
    } else if (f === 'import') { importFile(t.files && t.files[0]); t.value = ''; }
  });
  document.addEventListener('focusin', function (e) {
    var t = e.target; if (t.tagName === 'INPUT' && /^(set|pnum|adjnum|cfgnum|rstnum)$/.test(t.dataset.field || '')) setTimeout(function () { try { t.select(); } catch (x) { /* ignore */ } }, 0);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.dataset.field === 'set') e.target.blur(); });
  // press and hold +/- to keep stepping
  var suppressClick = false, hold = null;
  function endHold() {
    if (!hold) return;
    clearTimeout(hold.t);
    if (hold.n > 0) { suppressClick = true; setTimeout(function () { suppressClick = false; }, 500); save(); render(); }
    hold = null;
  }
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.set [data-act=inc], .set [data-act=dec]'); if (!b) return;
    var D = b.dataset, l = state.logs[ui.date], en = l && l.entries[+D.e]; if (!en) return;
    hold = { n: 0 };
    hold.t = setTimeout(function tick() {
      bump(en, +D.s, D.f, D.act === 'inc' ? 1 : -1); hold.n++;
      en.sets.forEach(function (st, k) { var inp = document.querySelector('input[data-field=set][data-e="' + D.e + '"][data-s="' + k + '"][data-f="' + D.f + '"]'); if (inp) inp.value = st[D.f] || 0; });
      if (navigator.vibrate) navigator.vibrate(5);
      hold.t = setTimeout(tick, hold.n > 8 ? 60 : 120);
    }, 420);
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) { document.addEventListener(ev, endHold); });
  document.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('.step')) e.preventDefault(); });
  window.addEventListener('pagehide', save);
  window.addEventListener('pageshow', function () { restTick(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) restTick(); if (document.hidden) save(); else if (ui.tab === 'today' && ui.lastDay !== todayKey()) { ui.date = todayKey(); ui.lastDay = ui.date; render(); } });
  ui.lastDay = todayKey();

  // ---------- backup ----------
  function exportData() {
    save();
    var json = JSON.stringify({ app: 'nick-recovery', exportedAt: new Date().toISOString(), data: state }, null, 1);
    var name = 'recovery-backup-' + todayKey() + '.json';
    var file;
    try { file = new File([json], name, { type: 'application/json' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Recovery backup' }).catch(function () { download(json, name); });
      return;
    }
    download(json, name);
  }
  function download(json, name) {
    var url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000); toast('Backup exported');
  }
  function importFile(file) {
    if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var obj = JSON.parse(rd.result); var data = obj && obj.data ? obj.data : obj;
        if (!data || !Array.isArray(data.days) || !Array.isArray(data.library)) throw new Error('Not a backup file');
        var n = Object.keys(data.logs || {}).length;
        if (!confirm('Replace everything on this phone with this backup (' + data.days.length + ' days, ' + n + ' logged dates)?')) return;
        backupPreUpgrade(data, JSON.stringify(data));
        state = migrate(data); save(); ui.date = todayKey(); render(); toast('Backup restored');
      } catch (err) { alert('Could not import: ' + err.message); }
    };
    rd.readAsText(file);
  }

  // ---------- boot ----------
  render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('./service-worker.js').catch(function (e) { console.warn('SW', e); }); });
  }
  window.__app = { get state() { return state; }, ui: ui, render: render, save: save, migrate: migrate, suggestFor: suggestFor, weekStats: weekStats, cfgOf: cfgOf, nextUp: nextUp, recentWorkouts: recentWorkouts, lastCompleted: lastCompleted, workoutSummary: workoutSummary, weeklySummary: weeklySummary, workoutSummaryData: workoutSummaryData, weeklySummaryData: weeklySummaryData, shareCoach: shareCoach, restOf: restOf, get timer() { return timer; }, restTick: restTick, warmupLine: warmupLine, skipStreak: skipStreak, orderItems: orderItems, coachNoteOf: coachNoteOf, setCoachNote: setCoachNote };
})();
