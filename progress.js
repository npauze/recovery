/* Progressive overload engine. Pure functions, no DOM. Used by app.js and the tests.
   Double progression: work up the rep range at a weight; when every working set hits the top,
   add weight and drop back to the bottom. Safety rules (left-arm cap, pain, Whoop) override. */
(function (root) {
  'use strict';
  function r2(v) { return Math.round(v * 100) / 100; }
  function epley(w, r) { w = +w || 0; r = +r || 0; if (w <= 0 || r <= 0) return 0; return r2(r === 1 ? w : w * (1 + r / 30)); }
  function maxOf(a, f) { var m = -Infinity; for (var i = 0; i < a.length; i++) { var v = f(a[i]); if (v > m) m = v; } return m; }
  function W(s) { return +s.w || 0; } function R(s) { return +s.r || 0; } function LV(s) { return +s.lv || 0; }
  // working sets = done sets within 10% of the session's top weight (ignores warm-ups)
  function working(sets) { if (!sets || !sets.length) return []; var top = maxOf(sets, W); return sets.filter(function (s) { return W(s) >= top * 0.9 - 1e-9; }); }
  function vol(sets, kind) {
    return (sets || []).reduce(function (a, s) { return a + (kind === 'min' ? W(s) : kind === 'none' ? R(s) : W(s) * R(s)); }, 0);
  }
  // ~10% lighter, rounded to the exercise's weight step, and always actually lighter
  function deload(w, inc) { var st = inc > 0 ? inc : 2.5; var x = Math.round(w * 0.9 / st) * st; if (x >= w) x = w - st; return Math.max(0, r2(x)); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function midRange(rmin, rmax) { return Math.round((rmin + rmax) / 2); }
  // Overshoot retune: 2.5 lb for DB/cable-style steps, otherwise 5 lb machines/barbell. Never round up.
  function retuneStep(c, inc) { if (c && c.retuneInc) return c.retuneInc; return (inc > 0 && inc <= 2.5) ? 2.5 : 5; }
  function floorInc(w, st) { st = st > 0 ? st : 5; return Math.max(0, r2(Math.floor((w + 1e-9) / st) * st)); }
  // Reps the Epley estimate predicts at a new weight, from the best working set (raw reps, so RPE < 10 sets
  // leave a natural buffer). Used after a weight jump so the target doesn't fall to the floor when the
  // overshoot supports more. Returns { lo, hi } inside [floor, rmax], or null when it lands at/below the floor.
  function jumpRange(ws, nw, floor, rmax) {
    if (!(nw > 0) || !ws || !ws.length) return null;
    var bestE = 0;
    ws.forEach(function (s) { var e = epley(W(s), R(s)); if (e > bestE) bestE = e; });
    if (!(bestE > nw)) return null;
    var hi = Math.min(rmax, Math.floor(30 * (bestE / nw - 1) + 1e-9));
    if (hi <= floor) return null;
    return { lo: Math.max(floor, hi - 2), hi: hi };
  }

  /* o: { kind: 'lb'|'none'|'min', hist: [{date, sets:[done sets], pain}] most recent first,
          cfg: {rmin, rmax, inc, minInc, lvInc}, item: {sets, reps, load}, nSets, whoop,
          safety: 'safe'|'caution'|'avoid', leftHold: bool, cap: number } */
  function suggest(o) {
    var k = o.kind || 'lb', c = o.cfg || {}, it = o.item || {}, H = o.hist || [], whoop = o.whoop || 'green';
    var rmin = c.rmin || 8, rmax = Math.max(rmin, c.rmax || 12), inc = c.inc || 5;
    var n = Math.max(1, o.nSets || it.sets || 3);
    var lh = !!o.leftHold && o.cap != null, cap = +o.cap;
    var painLast = !!(H.length && H[0].pain);
    var withSets = H.filter(function (h) { return h.sets && h.sets.length; });
    var last = withSets[0] || null;
    // Pain hold: never prescribe more sets than last time, even if the program calls for more.
    if (painLast && last && last.sets && last.sets.length) {
      var holdN = k === 'min' ? 1 : (working(last.sets).length || last.sets.length);
      if (holdN > 0 && n > holdN) n = holdN;
    }
    var res = { action: 'start', label: 'Start', tone: 'info', why: '', w: 0, reps: [], mins: 0, lv: 0, sets: n, last: last, rmin: rmin, rmax: rmax };
    function fill(v) { var a = []; for (var i = 0; i < n; i++) a.push(typeof v === 'function' ? v(i) : v); return a; }
    function capW(w) { return lh ? Math.min(w, cap) : w; }
    var PAIN_WHY = 'You flagged pain or discomfort last time, so no increase. Keep it pain-free. Stop and call your surgeon for sharp pain, a pop, new swelling, or numbness.';
    var AVOID_WHY = 'Loads the left arm: no progression until your surgeon clears it.';

    if (k === 'min') {
      var goal = +it.load || 20, minInc = c.minInc || 2, lvInc = c.lvInc || 1;
      if (!last) {
        res.mins = whoop === 'red' ? Math.max(8, Math.round(goal * 0.6)) : whoop === 'yellow' ? Math.round(goal * 0.8) : goal;
        res.why = 'First time: settle in at an easy-moderate pace.';
        if (painLast) { res.action = 'pain'; res.label = 'Hold (pain)'; res.tone = 'bad'; res.why = PAIN_WHY; }
        return res;
      }
      var M = vol(last.sets, 'min'), L = maxOf(last.sets, LV); if (L < 0) L = 0;
      res.mins = M; res.lv = L;
      if (o.safety === 'avoid') { res.action = 'blocked'; res.label = 'Hold'; res.tone = 'bad'; res.why = AVOID_WHY; }
      else if (painLast) { res.action = 'pain'; res.label = 'Hold (pain)'; res.tone = 'bad'; res.why = PAIN_WHY; }
      else if (whoop === 'red') { res.action = 'red'; res.label = 'Easy day'; res.tone = 'bad'; res.mins = Math.max(8, Math.round(goal * 0.6)); res.lv = L > 0 ? Math.max(0, r2(L - lvInc)) : 0; res.why = 'Whoop red: about 60% of your usual time, easy effort.'; }
      else if (whoop === 'yellow') { res.action = 'repeat'; res.label = 'Repeat last'; res.tone = 'warn'; res.why = 'Whoop yellow: same as last time, no increase.'; }
      else if (M < goal) { res.action = 'minutes'; res.mins = Math.min(goal, r2(M + minInc)); res.label = '+' + r2(res.mins - M) + ' min'; res.tone = 'ok'; res.why = 'Building toward your ' + goal + '-minute goal.'; }
      else if (L > 0) { res.action = 'level'; res.lv = r2(L + lvInc); res.label = '+' + lvInc + ' level'; res.tone = 'ok'; res.why = 'You hit your ' + goal + ' minutes. Same time, one notch more resistance.'; }
      else { res.action = 'hold'; res.label = 'At goal'; res.tone = 'info'; res.why = 'At your goal time. Log the level or resistance and I\u2019ll progress that next.'; }
      return res;
    }

    if (!last) {
      res.w = k === 'none' ? 0 : capW(+it.load || 0);
      if (whoop === 'red' && res.w > 0) res.w = deload(res.w, inc);
      res.reps = fill(clamp(+it.reps || rmin, 1, 999));
      res.why = k === 'none' ? 'First time: smooth reps, stop 2\u20133 short of failure.' : 'First time: pick a weight that leaves 2\u20133 reps in the tank.';
      if (painLast) { res.action = 'pain'; res.label = 'Hold (pain)'; res.tone = 'bad'; res.why = PAIN_WHY; }
      return res;
    }
    var ws = working(last.sets), Wt = maxOf(ws, W), lr = ws.map(R);
    function lastR(i) { return lr[Math.min(i, lr.length - 1)] || rmin; }
    var rp = ws.map(function (s) { return +s.rpe || 0; }).filter(Boolean);
    var allRated = rp.length > 0 && rp.length === ws.length, maxRpe = rp.length ? Math.max.apply(null, rp) : 0;
    res.w = Wt;
    if (o.safety === 'avoid') { res.action = 'blocked'; res.label = 'Hold'; res.tone = 'bad'; res.reps = fill(lastR); res.why = AVOID_WHY; }
    else if (painLast) { res.action = 'pain'; res.label = 'Hold (pain)'; res.tone = 'bad'; res.reps = fill(lastR); res.why = PAIN_WHY; }
    else if (whoop === 'red') { res.action = 'red'; res.label = Wt > 0 ? 'Deload ~10%' : 'Easy day'; res.tone = 'bad'; res.w = Wt > 0 ? deload(Wt, inc) : 0; res.reps = fill(lastR); res.why = 'Whoop red: lighter, fewer sets, nothing to failure.'; }
    else if (whoop === 'yellow') { res.action = 'repeat'; res.label = 'Repeat last'; res.tone = 'warn'; res.reps = fill(lastR); res.why = 'Whoop yellow: match last time, no increases. Leave 2\u20133 reps in the tank.'; }
    else if (k === 'none') {
      // Bodyweight: never drop reps below what he just did (pain/red already handled).
      // Even out to the best set, then +1. At a high-rep ceiling, add challenge with
      // tempo or a light plate in the RIGHT hand only — never a left-hand load.
      var bestR = lr.length ? maxOf(lr, function (r) { return r; }) : rmin;
      var allBest = lr.length && lr.every(function (r) { return r >= bestR; });
      var ceil = Math.max(20, rmax + 5);
      var TIP = 'Easy? Slow the lowering to 3 seconds, or hold a light plate with your RIGHT hand only.';
      if (allRated && maxRpe >= 10) {
        res.action = 'hold'; res.label = 'Repeat'; res.tone = 'warn'; res.reps = fill(lastR);
        res.why = 'Last time was all-out (RPE 10). Match it with cleaner reps before adding.';
      } else if (bestR < rmin) {
        res.action = 'hold'; res.label = 'Hold'; res.tone = 'warn'; res.reps = fill(rmin);
        res.why = 'Some sets fell short of ' + rmin + '. Aim for ' + rmin + '+ on every set.';
      } else if (bestR >= ceil) {
        res.action = 'tempo'; res.label = 'Add challenge'; res.tone = 'ok'; res.reps = fill(bestR);
        res.why = 'You\u2019re at a solid rep count. ' + TIP;
      } else if (!allBest) {
        res.action = 'rep'; res.label = 'Match best'; res.tone = 'ok'; res.reps = fill(bestR);
        res.why = 'Even out to your best set (' + bestR + ' reps) on every set.';
      } else {
        res.action = 'rep'; res.label = '+1 rep'; res.tone = 'ok'; res.reps = fill(bestR + 1);
        res.why = 'Nice work. Add a rep on every set. Stay smooth and stop short of failure.';
      }
    } else {
      var allTop = lr.every(function (r) { return r >= rmax; }), missed = lr.some(function (r) { return r < rmin; });
      var mid = midRange(rmin, rmax);
      // Big overshoot: any working set beats the top of the range by 3+ (includes a first
      // baseline session that landed well outside the intended range). Near-top first
      // sessions stay on normal double progression.
      var over = k === 'lb' && Wt > 0 && lr.some(function (r) { return r >= rmax + 3; });
      // Last-set bump (v12): if only the last working set is 3+ over rmax (and nothing
      // missed the floor), add the normal increment and return to the programmed range.
      // When every working set overshot, keep the v6 e1RM retune — that is a too-light weight,
      // not a last-set blow-through. Timed and bodyweight work never hit this branch (k === 'lb').
      var lastOver = k === 'lb' && Wt > 0 && lr.length && lr[lr.length - 1] >= rmax + 3;
      var allOver = !!lr.length && lr.every(function (r) { return r >= rmax + 3; });
      if (lastOver && !allOver && !missed && ws.length) {
        var nwLast = r2(Wt + inc);
        // Show mid–rmax (e.g. 8–10 on a 6–10 DB range) and prefill at mid, same idea as a retune landing.
        res.reps = fill(mid);
        res.repLo = mid;
        res.repHi = rmax;
        if (lh && nwLast > cap) {
          if (Wt >= cap) {
            res.action = 'cap'; res.label = 'At cap'; res.tone = 'warn'; res.w = cap; res.reps = fill(rmax);
            delete res.repLo; delete res.repHi;
            res.why = 'You\u2019re at your ' + cap + ' lb left-arm cap. No more weight until your surgeon clears it.';
          } else {
            res.action = 'weight'; res.label = '+' + r2(cap - Wt) + ' lb (cap)'; res.tone = 'ok'; res.w = cap;
            res.why = 'Last set went past the range. Capped at your ' + cap + ' lb left-arm limit.';
          }
        } else {
          res.action = 'weight'; res.label = '+' + r2(nwLast - Wt) + ' lb'; res.tone = 'ok'; res.w = nwLast;
          res.why = 'Your last set went 3+ reps past the ' + rmin + '\u2013' + rmax + ' range. Add weight and build back up from ' + rmin + '.';
        }
      } else if (over && ws.length) {
        var bestE = 0;
        ws.forEach(function (s) { var e = epley(W(s), R(s)); if (e > bestE) bestE = e; });
        var uncapped = floorInc(bestE / (1 + (mid + 2) / 30), retuneStep(c, inc));
        var nw = capW(uncapped);
        res.w = nw;
        res.reps = fill(mid);
        if (lh && uncapped > cap) {
          res.action = 'cap'; res.label = 'At cap'; res.tone = 'warn';
          res.why = 'You\u2019re at your ' + cap + ' lb left-arm cap. No more weight until your surgeon clears it.';
        } else {
          var jump = r2(nw - Wt);
          res.action = 'retune';
          res.label = jump > 0 ? '+' + jump + ' lb (retune)' : (jump < 0 ? jump + ' lb (retune)' : 'Mid-range');
          res.tone = 'ok';
          res.why = 'Last time went well past the ' + rmin + '\u2013' + rmax + ' range. New weight is estimated to land around ' + mid + ' reps at about RPE 8.';
          var rr = jumpRange(ws, nw, mid, rmax);
          if (rr) { res.repHi = rr.hi; if (rr.lo > mid) res.repLo = rr.lo; }
        }
      } else if (allTop) {
        var easy = allRated && maxRpe <= 7, nw = r2(Wt + inc * (easy ? 2 : 1));
        if (lh && nw > cap) {
          if (Wt >= cap) { res.action = 'cap'; res.label = 'At cap'; res.tone = 'warn'; res.w = cap; res.reps = fill(rmax); res.why = 'You\u2019re at your ' + cap + ' lb left-arm cap. No more weight until your surgeon clears it.'; }
          else { res.action = 'weight'; res.label = '+' + r2(cap - Wt) + ' lb (cap)'; res.tone = 'ok'; res.w = cap; res.reps = fill(rmin); res.why = 'Top of the range. Capped at your ' + cap + ' lb left-arm limit.'; }
        } else {
          res.action = 'weight'; res.label = '+' + r2(nw - Wt) + ' lb'; res.tone = 'ok'; res.w = nw; res.reps = fill(rmin);
          res.why = 'You hit ' + rmax + '+ on every set' + (easy ? ' and it felt easy (RPE \u2264 7), so a bigger jump' : '') + '. Add weight and build back up from ' + rmin + '.';
          // The miss floor stays at rmin (res.reps). When the reps he hit at the old weight predict more at
          // the new one (Epley, capped to the range), show that as a target range, e.g. 325×10–12.
          var jr = jumpRange(ws, nw, rmin, rmax);
          if (jr) { res.repHi = jr.hi; if (jr.lo > rmin) res.repLo = jr.lo; res.why = 'You hit ' + rmax + '+ on every set' + (easy ? ' and it felt easy (RPE \u2264 7), so a bigger jump' : '') + '. Add weight. Your last sets point to about ' + (jr.lo < jr.hi ? jr.lo + '\u2013' + jr.hi : jr.hi) + ' reps here; ' + rmin + ' is the floor.'; }
        }
      } else if (missed) {
        var prev = withSets[1], prevMissed = !!prev && working(prev.sets).some(function (s) { return R(s) < rmin; });
        if (prevMissed && k !== 'none' && Wt > 0) {
          res.action = 'deload'; res.label = 'Deload \u221210%'; res.tone = 'warn'; res.w = deload(Wt, inc); res.reps = fill(rmin);
          res.why = 'Under ' + rmin + ' reps two sessions in a row. Drop about 10% and build back up.';
        } else {
          res.action = 'hold'; res.label = 'Hold'; res.tone = 'warn'; res.reps = fill(rmin);
          res.why = prevMissed ? 'Short of the range twice. Hold here or pick an easier version.' : 'Some sets fell short of ' + rmin + '. Same weight; aim for ' + rmin + '+ on every set.';
        }
      } else if (allRated && maxRpe >= 10) {
        res.action = 'hold'; res.label = 'Repeat'; res.tone = 'warn'; res.reps = fill(lastR);
        res.why = 'Last time was all-out (RPE 10). Match it with cleaner reps before adding.';
      } else {
        res.action = 'rep'; res.label = '+1 rep'; res.tone = 'ok'; res.reps = fill(function (i) { return Math.min(rmax, lastR(i) + 1); });
        res.why = 'In range (' + rmin + '\u2013' + rmax + '). Add a rep per set; once every set hits ' + rmax + ', the weight goes up.';
      }
    }
    if (k === 'none') res.w = 0; else res.w = capW(res.w);
    return res;
  }

  /* PRs for one completed set.
     o: { kind, prior: [all done sets from earlier sessions], priorVols: [session volumes],
          before: [done sets earlier in today's entry], set, volNow, volBefore } */
  function detectPRs(o) {
    var k = o.kind || 'lb', prior = o.prior || [], s = o.set || {}, out = [];
    if (!prior.length) return out; // first time doing it: nothing to beat yet
    var all = prior.concat(o.before || []);
    var pv = (o.priorVols || []).length ? Math.max.apply(null, o.priorVols) : 0;
    var volPR = o.volNow > pv && (o.volBefore || 0) <= pv;
    if (k === 'min') {
      if (W(s) > maxOf(all, W)) out.push({ t: 'minutes', label: 'Longest' });
      if (LV(s) > 0 && LV(s) > maxOf(all, LV)) out.push({ t: 'level', label: 'Level PR' });
      return out;
    }
    if (k === 'none') {
      if (R(s) > maxOf(all, R)) out.push({ t: 'reps', label: 'Rep PR' });
      if (volPR) out.push({ t: 'volume', label: 'Volume PR' });
      return out;
    }
    if (W(s) > 0 && W(s) > maxOf(all, W)) out.push({ t: 'weight', label: 'Weight PR' });
    else {
      var heavier = all.filter(function (x) { return W(x) >= W(s); });
      if (heavier.length && R(s) > maxOf(heavier, R)) out.push({ t: 'reps', label: 'Rep PR @ ' + W(s) });
    }
    var e = epley(W(s), R(s));
    if (e > 0 && e > maxOf(all, function (x) { return epley(W(x), R(x)); }) + 0.01) out.push({ t: 'e1rm', label: 'Est. 1RM PR' });
    if (volPR) out.push({ t: 'volume', label: 'Volume PR' });
    return out;
  }

  // +1 beat, 0 matched, -1 under, compared with the same set last time
  function beat(kind, s, l) {
    if (!l) return null;
    if (kind === 'min') return W(s) > W(l) || (W(s) === W(l) && LV(s) > LV(l)) ? 1 : W(s) === W(l) && LV(s) === LV(l) ? 0 : -1;
    if (kind === 'none') return R(s) > R(l) ? 1 : R(s) === R(l) ? 0 : -1;
    if (W(s) === W(l)) return R(s) > R(l) ? 1 : R(s) === R(l) ? 0 : -1;
    if (W(s) > W(l)) return R(s) >= R(l) || epley(W(s), R(s)) >= epley(W(l), R(l)) ? 1 : -1;
    return epley(W(s), R(s)) > epley(W(l), R(l)) ? 1 : -1;
  }

  var api = { suggest: suggest, detectPRs: detectPRs, epley: epley, working: working, vol: vol, deload: deload, beat: beat, midRange: midRange, floorInc: floorInc, jumpRange: jumpRange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PROG = api;
})(this);
