/* Warm-up block helpers. Pure functions, no DOM. Used by app.js and the tests. */
(function (root) {
  'use strict';
  var IDS = ['cardio', 'dynamic', 'rom', 'ramp'];
  var LEG = { quads: 1, hams: 1, hips: 1, calves: 1 };
  var UPPER = { push: 1, pull: 1, delts: 1, arms: 1 };

  function isLegFocused(day, exercises) {
    var legs = 0, upper = 0, i, ex, text;
    for (i = 0; i < (exercises || []).length; i++) {
      ex = exercises[i];
      if (!ex) continue;
      if (LEG[ex.cat]) legs++;
      else if (UPPER[ex.cat]) upper++;
    }
    if (legs !== upper) return legs > upper;
    text = ((day && ((day.id || '') + ' ' + (day.name || '') + ' ' + (day.focus || ''))) || '').toLowerCase();
    if (/\b(quad|ham|glute|leg|squat|hip|calf)\b/.test(text)) return true;
    if (/\b(upper|push|pull|press|chest|shoulder|delt)\b/.test(text)) return false;
    return true; // default to a leg-day warm-up (incline walk; no rower)
  }

  function firstLift(exercises) {
    var list = exercises || [], i;
    for (i = 0; i < list.length; i++) if (list[i] && list[i].kind === 'lb') return list[i];
    for (i = 0; i < list.length; i++) if (list[i] && list[i].kind !== 'min' && list[i].cat !== 'cardio') return list[i];
    return list[0] || null;
  }

  function rampStep(inc) { return (inc && inc <= 2.5) ? 2.5 : 5; }

  function roundRamp(w, inc) {
    var step = rampStep(inc);
    var r = Math.round(Math.round(w / step) * step * 100) / 100;
    return r > 0 ? r : step;
  }

  function rampWeights(target, inc) {
    if (!(+target)) return [];
    var out = [], seen = {};
    [0.5, 0.7, 0.85].forEach(function (p) {
      var w = roundRamp(target * p, inc);
      if (!seen[w]) { seen[w] = 1; out.push(w); }
    });
    return out;
  }

  function fmtW(w) {
    var n = Math.round((+w) * 100) / 100;
    return (n % 1 === 0) ? String(n) : String(n);
  }

  function items(day, exercises, opts) {
    opts = opts || {};
    var leg = isLegFocused(day, exercises);
    var lift = firstLift(exercises);
    var name = opts.liftName || (lift && lift.name) || 'your first lift';
    var w = opts.targetW;
    var ramps = rampWeights(w, opts.inc);
    var rampDetail = ramps.length
      ? 'On ' + name + ': about ' + ramps.map(fmtW).join(', ') + ' lb (50/70/85% of ' + fmtW(w) + ' lb).'
      : 'On ' + name + ': 2\u20133 light sets, building up to your first work set.';
    return [
      {
        id: 'cardio',
        title: '5 min easy cardio',
        detail: leg
          ? 'Incline walk.'
          : 'Bike, arms-free or right hand only (no rower/SkiErg \u2014 protects left arm).'
      },
      {
        id: 'dynamic',
        title: '1\u20132 min dynamic',
        detail: leg
          ? 'Leg swings, hip openers, and right-arm circles.'
          : 'Leg swings, hip openers, right-arm circles, and right-arm band pull-aparts.'
      },
      {
        id: 'rom',
        title: 'Left-arm ROM primer',
        detail: 'A few slow, unloaded bend & straighten reps, pain-free. No weight in the left hand.'
      },
      {
        id: 'ramp',
        title: '2\u20133 ramp-up sets',
        detail: rampDetail
      }
    ];
  }

  function status(done, total) {
    if (done && typeof done === 'object' && !Array.isArray(done)) {
      var n = 0;
      (total || IDS).forEach(function (k) { if (done[k]) n++; });
      return status(n, (total && total.length) || IDS.length);
    }
    total = total == null ? IDS.length : total;
    done = +done || 0;
    return { done: done, total: total, label: done <= 0 ? 'skipped' : done >= total ? 'done' : 'partial ' + done + ' of ' + total };
  }

  function line(done, total) { return 'Warm-up: ' + status(done, total).label; }

  var api = { IDS: IDS, isLegFocused: isLegFocused, firstLift: firstLift, rampStep: rampStep, roundRamp: roundRamp,
    rampWeights: rampWeights, fmtW: fmtW, items: items, status: status, line: line };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WARM = api;
})(this);
