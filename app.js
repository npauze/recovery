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
  function seedDays() {
    return SEED.days.map(function (d) {
      return { id: d.id, name: d.name, focus: d.focus, weekdays: d.weekdays.slice(), items: d.items.map(function (it) { var x = clone(it); x.id = uid(); return x; }) };
    });
  }
  function seedState() {
    return {
      v: 1,
      settings: { surgery: '2026-10-26', checkup: '2026-12-08', cap: 8, step: 5, romTarget: 3 },
      library: clone(SEED.library),
      days: seedDays(),
      logs: {},
      dec8: { checked: {}, answers: '' }
    };
  }
  function migrate(s) {
    var b = seedState();
    s.settings = Object.assign({}, b.settings, s.settings || {});
    if (!Array.isArray(s.library)) s.library = b.library;
    // add any new seed exercises that are missing
    var have = {}; s.library.forEach(function (x) { have[x.id] = 1; });
    b.library.forEach(function (x) { if (!have[x.id]) s.library.push(x); });
    if (!Array.isArray(s.days)) s.days = b.days;
    s.logs = s.logs || {};
    s.dec8 = s.dec8 || b.dec8;
    s.v = 1;
    return s;
  }
  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) return migrate(JSON.parse(raw)); } catch (e) { console.warn(e); }
    return seedState();
  }
  var state = load();
  var saveTimer = null;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Could not save. Storage full?'); }
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }

  var ui = { tab: 'today', date: todayKey(), sheet: null, editDay: null, histEx: null, histMetric: 'top', libFilter: 'all', libQ: '' };

  // ---------- lookups ----------
  function lib(id) { for (var i = 0; i < state.library.length; i++) if (state.library[i].id === id) return state.library[i]; return null; }
  function day(id) { for (var i = 0; i < state.days.length; i++) if (state.days[i].id === id) return state.days[i]; return null; }
  function exInfo(id, fallback) {
    var e = lib(id);
    return e || { id: id, name: (fallback && fallback.name) || 'Removed exercise', kind: (fallback && fallback.kind) || 'lb', safety: 'caution', notes: '', cat: 'other' };
  }
  function badge(s) { var b = SAFETY[s] || SAFETY.caution; return '<span class="badge ' + b.cls + '">' + b.label + '</span>'; }
  function scheduledDay(iso) {
    var wd = parse(iso).getDay();
    for (var i = 0; i < state.days.length; i++) if (state.days[i].weekdays.indexOf(wd) >= 0) return state.days[i];
    return null;
  }
  function sessionDayId(iso) {
    var l = state.logs[iso];
    if (l && l.dayId) return l.dayId;
    // once work is logged, the day stays pinned to the session it was built from
    if (l && l.builtFor && l.entries.some(function (e) { return e.touched; })) return l.builtFor;
    var d = scheduledDay(iso);
    return d ? d.id : 'rest';
  }
  function getLog(iso) {
    var l = state.logs[iso];
    if (!l) l = state.logs[iso] = { dayId: null, whoop: 'green', entries: [], rom: 0, habits: {}, note: '', sig: '' };
    return l;
  }
  function phaseIndex(pod) { for (var i = 0; i < R.phases.length; i++) if (pod < R.phases[i][3]) return i; return R.phases.length - 1; }

  // ---------- performance ----------
  function doneSets(en) { return en.sets.filter(function (s) { return s.done; }); }
  function setsText(sets, kind) {
    if (kind === 'min') return sets.map(function (s) { return s.w + ' min'; }).join(', ');
    if (kind === 'none') return sets.map(function (s) { return s.r; }).join(', ') + ' reps';
    return sets.map(function (s) { return (s.w || 0) + '×' + s.r; }).join(', ') + ' lb';
  }
  function lastPerf(exId, beforeIso) {
    var keys = Object.keys(state.logs).filter(function (k) { return k < beforeIso; }).sort().reverse();
    for (var i = 0; i < keys.length; i++) {
      var l = state.logs[keys[i]];
      for (var j = 0; j < (l.entries || []).length; j++) {
        var en = l.entries[j];
        if (en.ex !== exId) continue;
        var ds = doneSets(en);
        if (!ds.length) continue;
        var top = Math.max.apply(null, ds.map(function (s) { return s.w || 0; }));
        return { date: keys[i], sets: ds, top: top, text: setsText(ds, en.kind) };
      }
    }
    return null;
  }

  // ---------- Whoop scaling ----------
  var WHOOP = {
    green: { lead: 'Green: full session', tone: 'ok', body: 'Prescribed sets. Train legs, right arm, and cardio hard. Left arm stays at pain-free ROM and under the cap.' },
    yellow: { lead: 'Yellow: trim volume', tone: 'warn', body: "One fewer set on most lifts (min 2). Same weights, leave 2–3 reps in reserve, don't grind to finish." },
    red: { lead: 'Red: keep it easy', tone: 'bad', body: 'About half the sets, weights ~10% lighter, cardio ~60%. Or switch to Conditioning and do 20–30 min easy plus ROM. Skip intensity.' }
  };
  function roundStep(v) { var st = state.settings.step || 5; return Math.max(0, Math.round(v / st) * st); }
  function scaled(it, whoop, kind) {
    var sets = it.sets, load = it.load;
    if (kind === 'min') {
      sets = 1;
      if (whoop === 'yellow') load = Math.round(load * 0.8);
      if (whoop === 'red') load = Math.max(8, Math.round(load * 0.6));
    } else {
      if (whoop === 'yellow') sets = Math.max(2, sets - 1);
      if (whoop === 'red') sets = Math.max(1, Math.ceil(sets * 0.5));
    }
    return { sets: sets, load: load };
  }
  function makeEntry(it, whoop, iso) {
    var ex = exInfo(it.ex);
    var sc = scaled(it, whoop, ex.kind);
    var w = sc.load;
    if (ex.kind === 'lb') {
      var last = lastPerf(it.ex, iso);
      w = last && last.top ? last.top : it.load;
      if (whoop === 'red' && w > 0) w = roundStep(w * 0.9);
    }
    if (ex.kind === 'none') w = 0;
    var sets = [];
    for (var i = 0; i < sc.sets; i++) sets.push({ w: w, r: ex.kind === 'min' ? 0 : it.reps, done: false });
    return { id: uid(), itemId: it.id, ex: it.ex, name: ex.name, kind: ex.kind, note: it.note || '', sets: sets, notes: '', touched: false };
  }
  function sigOf(d, whoop) { return whoop + '|' + JSON.stringify(d.items.map(function (i) { return [i.id, i.ex, i.sets, i.reps, i.load, i.note]; })); }
  function ensureSession(iso) {
    var dayId = sessionDayId(iso);
    if (dayId === 'rest') return null;
    var d = day(dayId), l = getLog(iso);
    if (!d) return l.entries.length ? l : null; // day was deleted: keep what was logged
    var sig = sigOf(d, l.whoop);
    var anyTouched = l.entries.some(function (e) { return e.touched; });
    if (l.builtFor !== dayId || (!anyTouched && l.sig !== sig)) {
      l.entries = d.items.map(function (it) { return makeEntry(it, l.whoop, iso); });
      l.builtFor = dayId; l.sig = sig; save();
    }
    return l;
  }
  function applyWhoop(iso, w) {
    var l = getLog(iso);
    l.whoop = w;
    var d = day(l.builtFor || sessionDayId(iso));
    if (d) {
      l.entries = l.entries.map(function (en) {
        if (en.touched) return en;
        var it = d.items.filter(function (i) { return i.id === en.itemId; })[0];
        if (!it) return en;
        var ne = makeEntry(Object.assign({}, it, { ex: en.ex }), w, iso); ne.id = en.id; return ne;
      });
      l.sig = sigOf(d, w);
    }
    save();
  }

  // carry a changed weight/reps forward to later, not-yet-done sets that still matched the old value
  function setVal(en, si, f, v) {
    var old = en.sets[si][f];
    en.sets[si][f] = v;
    for (var k = si + 1; k < en.sets.length; k++) { var x = en.sets[k]; if (!x.done && x[f] === old) x[f] = v; }
    en.touched = true;
  }

  // ---------- rendering helpers ----------
  function stepper(field, val, ei, si, unit) {
    return '<div class="step"><button data-act="dec" data-f="' + field + '" data-e="' + ei + '" data-s="' + si + '" aria-label="minus">−</button>' +
      '<div class="mid"><input inputmode="decimal" data-field="set" data-f="' + field + '" data-e="' + ei + '" data-s="' + si + '" value="' + esc(val) + '" aria-label="' + unit + '"><span class="u">' + unit + '</span></div>' +
      '<button data-act="inc" data-f="' + field + '" data-e="' + ei + '" data-s="' + si + '" aria-label="plus">+</button></div>';
  }
  function setRow(st, si, ei, kind) {
    var inner = '';
    if (kind === 'lb') inner = stepper('w', st.w, ei, si, 'lb') + stepper('r', st.r, ei, si, 'reps');
    else if (kind === 'min') inner = stepper('w', st.w, ei, si, 'min');
    else inner = stepper('r', st.r, ei, si, 'reps');
    return '<div class="set' + (st.done ? ' done' : '') + '"><span class="sn">' + (si + 1) + '</span>' + inner +
      '<button class="tick" data-act="sdone" data-e="' + ei + '" data-s="' + si + '" aria-label="Set done">✓</button></div>';
  }
  function entryCard(en, ei, iso) {
    var ex = exInfo(en.ex, en);
    var last = lastPerf(en.ex, iso);
    var dn = doneSets(en).length, all = en.sets.length > 0 && dn === en.sets.length;
    var note = en.note || ex.notes;
    var capOver = ex.kind === 'lb' && /left/i.test(ex.name) && en.sets.some(function (s) { return s.w > state.settings.cap; });
    return '<div class="card ex' + (all ? ' done' : '') + (ex.safety === 'avoid' ? ' flag' : '') + '">' +
      '<div class="ex-head"><button class="check' + (all ? ' on' : '') + '" data-act="edone" data-e="' + ei + '" aria-label="Mark exercise done">' + (all ? '✓' : '') + '</button>' +
      '<div class="grow"><div class="ex-name">' + esc(ex.name) + '</div>' + badge(ex.safety) + '</div>' +
      '<button class="btn sm ghost" data-act="swap" data-e="' + ei + '">Swap</button></div>' +
      (ex.safety === 'avoid' ? '<div class="callout bad"><b>Loads the left arm</b>Not until your surgeon clears it. Tap Swap for a safe option.</div>' : '') +
      (capOver ? '<div class="callout bad">Over your ' + state.settings.cap + ' lb left-arm cap.</div>' : '') +
      (note ? '<p class="muted small">' + esc(note) + '</p>' : '') +
      (last ? '<p class="last">Last (' + fmt(last.date, { month: 'short', day: 'numeric' }) + '): ' + esc(last.text) + '</p>' : '<p class="last muted">No history yet</p>') +
      '<div class="sets">' + en.sets.map(function (s, si) { return setRow(s, si, ei, ex.kind); }).join('') + '</div>' +
      '<div class="row"><button class="btn sm" data-act="addset" data-e="' + ei + '">+ Set</button>' +
      '<button class="btn sm" data-act="delset" data-e="' + ei + '"' + (en.sets.length <= 1 ? ' disabled' : '') + '>− Set</button>' +
      '<span class="grow"></span><button class="btn sm ghost danger" data-act="delentry" data-e="' + ei + '" aria-label="Remove from today">Remove</button></div>' +
      '<textarea class="note" rows="1" placeholder="Notes (how it felt, machine settings…)" data-field="enote" data-e="' + ei + '">' + esc(en.notes) + '</textarea>' +
      '</div>';
  }

  // ---------- views ----------
  function vToday() {
    var iso = ui.date, s = state.settings, t = todayKey();
    var pod = diff(s.surgery, iso), wk = Math.max(1, Math.ceil(Math.max(pod, 1) / 7)), toChk = diff(iso, s.checkup);
    var pi = phaseIndex(pod), ph = R.phases[pi];
    var existing = state.logs[iso];
    var whoop = (existing && existing.whoop) || 'green';
    var dayId = sessionDayId(iso);
    var sched = scheduledDay(iso);
    var h = '';
    h += '<div class="datebar"><button class="btn icon" data-act="date" data-n="-1" aria-label="Previous day">‹</button><div class="d">' +
      (iso === t ? 'Today · ' : '') + fmt(iso) + (iso !== t ? ' <button class="btn sm ghost" data-act="date" data-n="0">Go to today</button>' : '') +
      '</div><button class="btn icon" data-act="date" data-n="1" aria-label="Next day">›</button></div>';
    h += '<div class="stats"><div class="stat"><b>Day ' + pod + '</b><span>Post-op · week ' + wk + '</span></div>' +
      '<div class="stat"><b>' + (toChk > 0 ? toChk + 'd' : toChk === 0 ? 'Today' : 'Done') + '</b><span>To ' + fmt(s.checkup, { month: 'short', day: 'numeric' }) + ' checkup</span></div>' +
      '<div class="stat"><b>' + ph[0].replace('Weeks ', 'Wk ') + '</b><span>' + (pi === 1 ? 'Motion phase' : pi === 0 ? 'Protect phase' : 'Needs clearance') + '</span></div></div>';
    if (toChk <= 0) h += '<div class="callout warn"><b>Checkup date reached</b>Keep the ' + s.cap + ' lb cap until you apply what was cleared. Update limits under More.</div>';
    h += '<div class="callout bad"><b>Left arm: pain-free ROM, ≤ ' + s.cap + ' lb</b>No gripping, pushing, pulling, bracing, or hanging with the left. Stop and call your surgeon for sharp pain, a pop, new swelling, or numbness. <a href="#" data-act="tab" data-t="rehab">Rehab details</a></div>';

    h += '<h2>Whoop recovery</h2><div class="seg">' + ['green', 'yellow', 'red'].map(function (w) {
      return '<button class="' + w[0] + (whoop === w ? ' on' : '') + '" data-act="whoop" data-w="' + w + '">' + w[0].toUpperCase() + w.slice(1) + '</button>';
    }).join('') + '</div><div class="callout ' + WHOOP[whoop].tone + '"><b>' + WHOOP[whoop].lead + '</b>' + WHOOP[whoop].body + '</div>';

    // rehab check-off
    var rom = (existing && existing.rom) || 0, tgt = s.romTarget || 3, hab = (existing && existing.habits) || {};
    var dots = ''; for (var i = 0; i < Math.max(tgt, rom); i++) dots += '<i class="' + (i < rom ? 'on' : '') + '"></i>';
    h += '<h2>Rehab today</h2><div class="card"><div class="row between"><div><b>Left-arm ROM</b><div class="muted small">' + rom + ' of ' + tgt + ' sessions · 5–10 min, pain-free</div></div><div class="rom-dots">' + dots + '</div></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn pri grow" data-act="rom" data-n="1">+ Did a ROM session</button><button class="btn" data-act="rom" data-n="-1"' + (rom ? '' : ' disabled') + ' aria-label="Undo ROM session">Undo</button></div>' +
      '<div class="chips" style="margin-top:10px">' + R.habits.map(function (x) { return '<button class="chip' + (hab[x[0]] ? ' on' : '') + '" data-act="habit" data-k="' + x[0] + '">' + (hab[x[0]] ? '✓ ' : '') + esc(x[1]) + '</button>'; }).join('') + '</div></div>';

    // session
    var opts = state.days.map(function (d) { return '<option value="' + esc(d.id) + '"' + (d.id === dayId ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') +
      '<option value="rest"' + (dayId === 'rest' ? ' selected' : '') + '>Rest day</option>';
    h += '<h2>Session</h2><label class="f" style="margin-top:0">Session for ' + WD[parse(iso).getDay()] + (sched ? ' (scheduled: ' + esc(sched.name) + ')' : ' (no session scheduled)') +
      '<select data-field="pickday">' + opts + '</select></label>';
    if (dayId === 'rest') {
      h += '<div class="card"><h3>Rest day</h3><p class="muted">Optional easy walk or hands-free bike, plus your ROM sessions. No lifting needed. Pick a session above if you want to train.</p></div>';
    } else {
      var l = ensureSession(iso), d = day(dayId) || { name: 'Deleted session', focus: '' };
      if (!l) return h + '<div class="card"><p class="muted">This session no longer exists. Pick another above.</p></div>';
      var exDone = l.entries.filter(function (e) { return e.sets.length && doneSets(e).length === e.sets.length; }).length;
      h += '<div class="card"><div class="row between"><h3>' + esc(d.name) + '</h3><span class="muted small">' + exDone + '/' + l.entries.length + ' done</span></div><p class="muted small">' + esc(d.focus || '') + '</p>' +
        '<div class="row" style="margin-top:8px"><button class="btn sm" data-act="addentry">+ Exercise today</button><button class="btn sm ghost" data-act="rebuild">Reset session</button></div></div>';
      h += l.entries.map(function (en, ei) { return entryCard(en, ei, iso); }).join('');
    }
    var note = (existing && existing.note) || '';
    h += '<h2>Day notes</h2><textarea rows="2" placeholder="Arm feel, swelling, sleep, anything to tell the surgeon…" data-field="dnote">' + esc(note) + '</textarea>';
    return h;
  }

  function miniStep(lbl, act, d, i, val) {
    return '<div class="step"><span class="lbl">' + lbl + '</span><button data-act="' + act + '" data-dir="-1" data-d="' + esc(d) + '" data-i="' + i + '">−</button>' +
      '<input inputmode="decimal" data-field="pnum" data-k="' + act + '" data-d="' + esc(d) + '" data-i="' + i + '" value="' + esc(val) + '"><button data-act="' + act + '" data-dir="1" data-d="' + esc(d) + '" data-i="' + i + '">+</button></div>';
  }
  function vProgram() {
    var h = '<p class="muted small">Your week. Tap weekdays to schedule, Edit to change exercises. Changes save automatically and apply to new sessions.</p>';
    var count = {}; state.days.forEach(function (d) { d.weekdays.forEach(function (w) { count[w] = (count[w] || 0) + 1; }); });
    var dup = Object.keys(count).filter(function (k) { return count[k] > 1; }).map(function (k) { return WD[k]; });
    if (dup.length) h += '<div class="callout warn">' + dup.join(', ') + ' has more than one session. Today uses the first one in the list.</div>';
    state.days.forEach(function (d, di) {
      var open = ui.editDay === d.id;
      h += '<div class="card"><div class="row"><div class="grow"><h3>' + esc(d.name) + '</h3><div class="muted small">' + d.items.length + ' exercises</div></div>' +
        '<button class="btn icon sm" data-act="dmove" data-d="' + esc(d.id) + '" data-dir="-1"' + (di === 0 ? ' disabled' : '') + ' aria-label="Move up">↑</button>' +
        '<button class="btn icon sm" data-act="dmove" data-d="' + esc(d.id) + '" data-dir="1"' + (di === state.days.length - 1 ? ' disabled' : '') + ' aria-label="Move down">↓</button>' +
        '<button class="btn sm' + (open ? ' pri' : '') + '" data-act="dedit" data-d="' + esc(d.id) + '">' + (open ? 'Done' : 'Edit') + '</button></div>' +
        '<div class="chips wd" style="margin-top:10px">' + WD_ORDER.map(function (w) { return '<button class="chip' + (d.weekdays.indexOf(w) >= 0 ? ' on' : '') + '" data-act="wd" data-d="' + esc(d.id) + '" data-w="' + w + '">' + WD[w] + '</button>'; }).join('') + '</div>';
      if (!open) {
        h += '<ul class="list" style="margin-top:8px">' + d.items.map(function (it) {
          var ex = exInfo(it.ex);
          return '<li class="item-row"><span class="grow">' + esc(ex.name) + (ex.safety === 'avoid' ? ' <span class="badge bad">Loads left arm</span>' : '') + '</span><span class="muted small">' + presc(it, ex) + '</span></li>';
        }).join('') + '</ul>';
      } else {
        h += '<label class="f">Name<input type="text" data-field="dname" data-d="' + esc(d.id) + '" value="' + esc(d.name) + '"></label>' +
          '<label class="f">Focus / cues<textarea rows="2" data-field="dfocus" data-d="' + esc(d.id) + '">' + esc(d.focus || '') + '</textarea></label>';
        h += '<ul class="list">' + d.items.map(function (it, i) {
          var ex = exInfo(it.ex);
          var steps = ex.kind === 'min' ? miniStep('min', 'pload', d.id, i, it.load)
            : miniStep('sets', 'psets', d.id, i, it.sets) + miniStep('reps', 'preps', d.id, i, it.reps) + (ex.kind === 'lb' ? miniStep('lb', 'pload', d.id, i, it.load) : '');
          return '<li><div class="item-row"><div class="grow"><b>' + esc(ex.name) + '</b><br>' + badge(ex.safety) + '</div>' +
            '<button class="btn icon sm" data-act="imove" data-d="' + esc(d.id) + '" data-i="' + i + '" data-dir="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move up">↑</button>' +
            '<button class="btn icon sm" data-act="imove" data-d="' + esc(d.id) + '" data-i="' + i + '" data-dir="1"' + (i === d.items.length - 1 ? ' disabled' : '') + ' aria-label="Move down">↓</button></div>' +
            (ex.safety === 'avoid' ? '<div class="callout bad">Loads the left arm. Swap it until you are cleared.</div>' : '') +
            '<div class="mini">' + steps + '</div>' +
            '<div class="row" style="margin-top:8px"><button class="btn sm" data-act="pswap" data-d="' + esc(d.id) + '" data-i="' + i + '">Swap</button>' +
            '<span class="grow"></span><button class="btn sm ghost danger" data-act="idel" data-d="' + esc(d.id) + '" data-i="' + i + '">Remove</button></div></li>';
        }).join('') + '</ul>' +
          '<div class="row wrap" style="margin-top:10px"><button class="btn pri sm" data-act="padd" data-d="' + esc(d.id) + '">+ Add exercise</button><span class="grow"></span>' +
          '<button class="btn sm ghost danger" data-act="ddel" data-d="' + esc(d.id) + '">Delete day</button></div>';
      }
      h += '</div>';
    });
    h += '<div class="row" style="margin-top:6px"><button class="btn block" data-act="dadd">+ Add training day</button></div>';

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
    if (ex.kind === 'none') return it.sets + '×' + it.reps;
    return it.sets + '×' + it.reps + (it.load ? ' @ ' + it.load + ' lb' : '');
  }

  // history
  function meaningful(l) {
    return (l.rom > 0) || (l.note && l.note.trim()) || (l.entries || []).some(function (e) { return e.touched || doneSets(e).length; }) ||
      Object.keys(l.habits || {}).some(function (k) { return l.habits[k]; });
  }
  function metricOf(en, m) {
    var ds = doneSets(en); if (!ds.length) return null;
    if (en.kind === 'min') return ds.reduce(function (a, s) { return a + (s.w || 0); }, 0);
    if (en.kind === 'none' || m === 'reps') return Math.max.apply(null, ds.map(function (s) { return s.r || 0; }));
    if (m === 'vol') return ds.reduce(function (a, s) { return a + (s.w || 0) * (s.r || 0); }, 0);
    return Math.max.apply(null, ds.map(function (s) { return s.w || 0; }));
  }
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
    var h = '<h2>Progress</h2><div class="card">';
    if (!exIds.length) h += '<p class="muted">Log a workout and your progress charts show up here.</p>';
    else {
      if (!ui.histEx || exIds.indexOf(ui.histEx) < 0) ui.histEx = exIds[0];
      var kind = exSeen[ui.histEx].kind;
      h += '<select data-field="histex">' + exIds.map(function (id) { return '<option value="' + esc(id) + '"' + (id === ui.histEx ? ' selected' : '') + '>' + esc(exInfo(id, exSeen[id]).name) + '</option>'; }).join('') + '</select>';
      var m = ui.histMetric;
      if (kind === 'lb') h += '<div class="seg" style="margin-top:8px">' + [['top', 'Top weight'], ['vol', 'Volume'], ['reps', 'Best reps']].map(function (o) { return '<button class="' + (m === o[0] ? 'on' : '') + '" data-act="hmet" data-m="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>';
      var pts = keys.slice().reverse().map(function (k) {
        var best = null; state.logs[k].entries.forEach(function (e) { if (e.ex === ui.histEx) { var v = metricOf(e, m); if (v != null && (best == null || v > best)) best = v; } });
        return best == null ? null : { x: k, y: best };
      }).filter(Boolean);
      var unit = kind === 'min' ? 'min' : kind === 'none' || m === 'reps' ? 'reps' : m === 'vol' ? 'lb×reps' : 'lb';
      h += '<div style="margin-top:10px">' + chart(pts, unit) + '</div>';
    }
    h += '</div><h2>Log</h2>';
    if (!keys.length) h += '<div class="card"><p class="muted">Nothing logged yet.</p></div>';
    keys.forEach(function (k) {
      var l = state.logs[k];
      var d = l.builtFor ? day(l.builtFor) : null;
      var worked = l.entries.filter(function (e) { return doneSets(e).length; });
      var nsets = worked.reduce(function (a, e) { return a + doneSets(e).length; }, 0);
      h += '<details class="card hist-day"><summary><span class="wdot ' + (l.whoop || 'green') + '"></span><div class="grow"><b>' + fmt(k) + '</b><div class="muted small">' +
        (worked.length ? esc(d ? d.name : 'Workout') + ' · ' + worked.length + ' exercises · ' + nsets + ' sets' : 'No lifting') + ' · ROM ' + (l.rom || 0) + '</div></div><span class="muted">›</span></summary>' +
        '<ul class="list" style="margin-top:6px">' + worked.map(function (e) {
          return '<li><b>' + esc(exInfo(e.ex, e).name) + '</b><div class="muted small">' + esc(setsText(doneSets(e), e.kind)) + '</div>' + (e.notes ? '<div class="small">' + esc(e.notes) + '</div>' : '') + '</li>';
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
      '<label class="f">Weight step for +/− (lb)<input type="number" inputmode="decimal" data-field="setting" data-k="step" value="' + s.step + '"></label>' +
      '<p class="small muted">Only raise the cap after your surgeon clears it.</p></div>';
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
  function closeSheet() { ui.sheet = null; renderSheet(); }
  function renderSheet() {
    var root = $('#sheet-root'), sh = ui.sheet;
    if (!sh) { root.innerHTML = ''; document.body.style.overflow = ''; return; }
    document.body.style.overflow = 'hidden';
    var body = sh.type === 'custom' ? customForm(sh) : pickList(sh);
    root.innerHTML = '<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + body + '</div>';
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
      var last = lastPerf(x.id, ui.date);
      var w = x.kind === 'none' ? 0 : x.kind === 'min' ? (en.kind === 'min' ? en.sets[0].w : 20) : (last && last.top) || 0;
      if (x.kind === 'min') en.sets = [{ w: w, r: 0, done: false }];
      else en.sets = en.sets.map(function (s) { return { w: w, r: s.r || 10, done: false }; });
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

  // ---------- render ----------
  var TITLES = { today: 'Today', program: 'Program', history: 'History', rehab: 'Rehab', more: 'More' };
  function render() {
    var v = { today: vToday, program: vProgram, history: vHistory, rehab: vRehab, more: vMore }[ui.tab];
    $('#main').innerHTML = v();
    $('#title').textContent = TITLES[ui.tab];
    var s = state.settings, pod = diff(s.surgery, todayKey());
    $('#sub').textContent = 'Post-op day ' + pod + ' · ' + Math.max(0, diff(todayKey(), s.checkup)) + 'd to checkup';
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.dataset.tab === ui.tab); });
  }
  var toastT;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 1800); }
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
      case 'date': ui.date = D.n === '0' ? todayKey() : addDays(ui.date, +D.n); render(); return;
      case 'whoop': applyWhoop(ui.date, D.w); render(); return;
      case 'rom': {
        var iso = D.today ? todayKey() : ui.date;
        l = getLog(iso); l.rom = Math.max(0, (l.rom || 0) + (+D.n)); save(); vibrate();
        if (+D.n > 0) toast('ROM session ' + l.rom + ' logged'); render(); return;
      }
      case 'habit': l = getLog(ui.date); l.habits = l.habits || {}; l.habits[D.k] = !l.habits[D.k]; save(); render(); return;
      case 'inc': case 'dec': {
        l = state.logs[ui.date]; en = l.entries[+D.e]; var st = en.sets[+D.s], dir = a === 'inc' ? 1 : -1;
        if (D.f === 'w') { var step = en.kind === 'min' ? 5 : (state.settings.step || 5); setVal(en, +D.s, 'w', clamp(Math.round(((st.w || 0) + dir * step) * 10) / 10, 0, 2000)); }
        else setVal(en, +D.s, 'r', clamp((st.r || 0) + dir, 0, 200));
        saveSoon(); render(); return;
      }
      case 'sdone': {
        l = state.logs[ui.date]; en = l.entries[+D.e]; var s2 = en.sets[+D.s]; s2.done = !s2.done; en.touched = true;
        if (s2.done) vibrate();
        save(); render(); return;
      }
      case 'edone': {
        l = state.logs[ui.date]; en = l.entries[+D.e]; var all = en.sets.every(function (s) { return s.done; });
        en.sets.forEach(function (s) { s.done = !all; }); en.touched = true; if (!all) vibrate(); save(); render(); return;
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
        l.builtFor = null; l.entries = []; ensureSession(ui.date); render(); return;
      }
      case 'pick': doPick(D.x); return;
      case 'showall': ui.sheet.all = true; renderSheet(); return;
      case 'close': closeSheet(); return;
      case 'custom': openSheet({ type: 'custom', then: ui.sheet && ui.sheet.type !== 'custom' ? ui.sheet : null }); return;
      case 'cxsave': {
        var name = $('#cx-name').value.trim(); if (!name) { toast('Give it a name'); return; }
        var x = { id: 'c-' + uid(), name: name, cat: $('#cx-cat').value, kind: $('#cx-kind').value, safety: $('#cx-safety').value, notes: $('#cx-notes').value.trim(), custom: true };
        if (x.safety !== 'avoid' && RISKY.test(name) && !confirm('"' + name + '" sounds like it may load the left arm. Save it tagged as ' + SAFETY[x.safety].label.toLowerCase() + ' anyway?')) return;
        state.library.push(x); save();
        var then = ui.sheet.then;
        if (then) { ui.sheet = then; doPick(x.id); } else { closeSheet(); toast('Saved to library'); render(); }
        return;
      }
      // program
      case 'dedit': ui.editDay = ui.editDay === D.d ? null : D.d; render(); return;
      case 'wd': d = day(D.d); var w = +D.w, k = d.weekdays.indexOf(w); if (k >= 0) d.weekdays.splice(k, 1); else d.weekdays.push(w); save(); render(); return;
      case 'dmove': i = state.days.indexOf(day(D.d)); var j = i + (+D.dir); if (j >= 0 && j < state.days.length) { var tmp = state.days[i]; state.days[i] = state.days[j]; state.days[j] = tmp; save(); render(); } return;
      case 'dadd': { var nd = { id: 'd-' + uid(), name: 'New day', focus: '', weekdays: [], items: [] }; state.days.push(nd); ui.editDay = nd.id; save(); render(); return; }
      case 'ddel': d = day(D.d); if (confirm('Delete "' + d.name + '"? Past logs stay in History.')) { state.days.splice(state.days.indexOf(d), 1); ui.editDay = null; save(); render(); } return;
      case 'imove': d = day(D.d); i = +D.i; var j2 = i + (+D.dir); if (j2 >= 0 && j2 < d.items.length) { var t2 = d.items[i]; d.items[i] = d.items[j2]; d.items[j2] = t2; save(); render(); } return;
      case 'idel': d = day(D.d); d.items.splice(+D.i, 1); save(); render(); return;
      case 'psets': case 'preps': case 'pload': {
        d = day(D.d); it = d.items[+D.i]; var dirn = +D.dir, ex = exInfo(it.ex);
        if (a === 'psets') it.sets = clamp(it.sets + dirn, 1, 12);
        if (a === 'preps') it.reps = clamp(it.reps + dirn, 1, 100);
        if (a === 'pload') it.load = clamp((it.load || 0) + dirn * (ex.kind === 'min' ? 5 : state.settings.step || 5), 0, 2000);
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
      case 'openday': ui.date = D.k; ui.tab = 'today'; render(); window.scrollTo(0, 0); return;
      // more
      case 'export': exportData(); return;
      case 'wipe': if (confirm('Erase all program, logs, and settings on this phone? Export a backup first if you want to keep them.')) { localStorage.removeItem(KEY); state = seedState(); save(); render(); toast('Reset to fresh'); } return;
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target, f = t.dataset && t.dataset.field; if (!f) return;
    var l, D = t.dataset;
    if (f === 'enote') { l = state.logs[ui.date]; l.entries[+D.e].notes = t.value; l.entries[+D.e].touched = true; saveSoon(); }
    else if (f === 'dnote') { l = getLog(ui.date); l.note = t.value; saveSoon(); }
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
    } else if (f === 'pnum') {
      var it = day(D.d).items[+D.i], v2 = Math.max(0, num(t.value, 0));
      if (D.k === 'psets') it.sets = clamp(Math.round(v2), 1, 12); else if (D.k === 'preps') it.reps = clamp(Math.round(v2), 1, 100); else it.load = v2;
      save(); render();
    } else if (f === 'pickday') {
      l = getLog(ui.date);
      var hasWork = l.entries.some(function (x) { return doneSets(x).length; });
      if (hasWork && !confirm('Switch session? Sets you logged for this day will be replaced.')) { render(); return; }
      l.dayId = t.value; l.builtFor = null; l.entries = []; save(); render();
    } else if (f === 'dname' || f === 'dfocus') { save(); }
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
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', function () { if (document.hidden) save(); else if (ui.tab === 'today' && ui.lastDay !== todayKey()) { ui.date = todayKey(); ui.lastDay = ui.date; render(); } });
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
  window.__app = { get state() { return state; }, ui: ui, render: render, save: save };
})();
