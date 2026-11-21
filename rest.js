/* Rest timer math. Pure functions, no DOM. Used by app.js and the tests.
   Timestamp based: everything is computed from Date.now() values, so the countdown stays
   right when the phone is locked, the tab is in the background, or the app is reopened. */
(function (root) {
  'use strict';
  var STALE_MS = 15 * 60 * 1000; // drop a finished timer after 15 min of overtime

  // t: { end, total, paused, left, ... } (ms). now: Date.now()
  function start(info, secs, now) {
    var ms = Math.max(0, Math.round(secs)) * 1000;
    var t = { end: now + ms, total: ms, paused: false, left: 0, alerted: false, startedAt: now };
    for (var k in info) if (Object.prototype.hasOwnProperty.call(info, k)) t[k] = info[k];
    return t;
  }
  function remaining(t, now) { return !t ? 0 : t.paused ? t.left : t.end - now; }
  function done(t, now) { return !!t && remaining(t, now) <= 0; }
  function overtime(t, now) { return Math.max(0, -remaining(t, now)); }
  function adjust(t, secs, now) {
    var d = secs * 1000;
    if (t.paused) { t.left = Math.max(0, t.left + d); }
    else {
      var r = t.end - now;
      if (r <= 0 && d > 0) { t.end = now + d; t.total = d; t.alerted = false; return t; } // restart from 0
      t.end = Math.max(now, t.end + d);
    }
    t.total = Math.max(1000, t.total + d);
    if (remaining(t, now) > 0) t.alerted = false;
    return t;
  }
  function pause(t, now) { if (!t.paused) { t.left = Math.max(0, t.end - now); t.paused = true; } return t; }
  function resume(t, now) { if (t.paused) { t.end = now + t.left; t.paused = false; t.left = 0; } return t; }
  function toggle(t, now) { return t.paused ? resume(t, now) : pause(t, now); }
  function stale(t, now) { return !t || (!t.paused && now - t.end > STALE_MS) || (now - (t.startedAt || now) > 3 * 3600 * 1000); }
  // fraction elapsed 0..1 for the progress bar
  function progress(t, now) { if (!t || !t.total) return 1; return Math.min(1, Math.max(0, 1 - remaining(t, now) / t.total)); }
  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }
  function label(secs) {
    if (!secs) return 'Off';
    var m = Math.floor(secs / 60), s = secs % 60;
    return m ? m + ':' + String(s).padStart(2, '0') : s + ' s';
  }
  // Right-arm or single-arm work: rest is a good time for an unloaded left-arm ROM set.
  function romEligible(ex) {
    if (!ex) return false;
    if (ex.kind === 'min' || ex.cat === 'cardio') return false;
    if (['push', 'pull', 'delts', 'arms'].indexOf(ex.cat) >= 0) return true;
    if (ex.cat === 'core' && /-r$/.test(ex.id || '')) return true; // e.g. right-only Pallof press
    if (ex.cat === 'other' || !ex.cat) return /\b(right arm|right only|single-arm|one-arm)\b|, right$/i.test(ex.name || '');
    return false;
  }
  var ROM_TEXT = 'Rest = a left-arm ROM set: slow, unloaded bend & straighten, pain-free. No weight in the left hand.';

  var api = { start: start, remaining: remaining, done: done, overtime: overtime, adjust: adjust, pause: pause, resume: resume, toggle: toggle,
    stale: stale, progress: progress, clock: clock, label: label, romEligible: romEligible, ROM_TEXT: ROM_TEXT, STALE_MS: STALE_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.REST = api;
})(this);
