/* Plain-text coach recaps. Pure functions, no DOM. Used by app.js and the tests. */
(function (root) {
  'use strict';
  var MUL = '\u00d7';

  function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }
  function cap(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  function formatSets(kind, sets) {
    if (!sets || !sets.length) return '';
    if (kind === 'min') return sets.map(function (s) { return s.w + ' min' + (s.lv ? ' L' + s.lv : ''); }).join(', ');
    if (kind === 'none') return sets.map(function (s) { return String(s.r); }).join(', ') + ' reps';
    return sets.map(function (s) {
      var t = (s.w || 0) + MUL + s.r;
      if (s.rpe) t += ' @ RPE ' + s.rpe;
      return t;
    }).join(', ');
  }

  function formatTarget(kind, sg) {
    if (!sg) return '';
    if (kind === 'min') return sg.mins + ' min' + (sg.lv ? ' L' + sg.lv : '');
    var reps = sg.reps || [];
    var same = reps.length && reps.every(function (r) { return r === reps[0]; });
    var lo = same ? (sg.repLo || reps[0]) : 0;
    var range = same && sg.repHi && sg.repHi > lo;
    var rtxt = range ? lo + '\u2013' + sg.repHi : (same ? reps[0] + ' ' + MUL + ' ' + reps.length : reps.join(', '));
    if (kind === 'none') return rtxt + ' reps';
    return (sg.w || 0) + ' lb ' + MUL + ' ' + rtxt;
  }

  // Skipped-last-time nudge. Timed items (cardio, kind 'min') get a minutes ask, never "sets".
  function skipNudge(kind, sg) {
    if (kind === 'min') {
      var m = (sg && +sg.mins) || 0;
      var ask = m > 0 ? Math.min(m, Math.max(5, Math.round(m / 2))) : 5;
      return 'Skipped last time \u2014 get it in, even ' + ask + ' min';
    }
    return 'Skipped last time \u2014 get at least 2 sets in';
  }

  function compactTarget(name, kind, sg) {
    if (!sg) return name;
    var tag = '';
    if (sg.skippedLast) tag = ' (' + skipNudge(kind, sg).toLowerCase() + ')';
    else if (sg.action === 'pain') tag = ' (hold, pain)';
    else if (sg.action === 'cap' || sg.action === 'blocked') tag = ' (hold)';
    else if (sg.action === 'deload' || sg.action === 'red') tag = ' (deload)';
    else if (sg.action === 'repeat') tag = ' (repeat)';
    if (kind === 'min') return name + ' ' + sg.mins + ' min' + (sg.lv ? ' L' + sg.lv : '') + tag;
    var reps = sg.reps || [];
    var same = reps.length && reps.every(function (r) { return r === reps[0]; });
    var lo = same ? (sg.repLo || reps[0]) : 0;
    var range = same && sg.repHi && sg.repHi > lo;
    var rpart = range ? lo + '\u2013' + sg.repHi + ' ' + MUL + ' ' + reps.length
      : (same ? reps[0] + ' ' + MUL + ' ' + reps.length : reps.join('/'));
    if (kind === 'none' || ((sg.action === 'start' || sg.skippedLast) && !(+sg.w))) return name + ' ' + rpart + tag;
    return name + ' ' + (sg.w || 0) + MUL + (range ? lo + '\u2013' + sg.repHi + ' ' + MUL + ' ' + reps.length : (same ? reps[0] + ' ' + MUL + ' ' + reps.length : reps.join('/'))) + tag;
  }

  // Compare done sets to the session target. Short a set, or any set under target weight/reps, is a miss.
  // First session / unset 0 lb target is a baseline, never a miss.
  function isBaseline(kind, sg) {
    if (!sg) return false;
    if (kind === 'min') return false;
    // action 'start' or last === null is an explicit first session (suggest always sets last).
    // A 0 / unset target weight is also a baseline. Don't treat a missing last field as no history.
    if (sg.action === 'start' || sg.last === null) return true;
    if (kind === 'lb' && !(+sg.w)) return true;
    return false;
  }
  function vsTarget(kind, sets, sg) {
    if (!sg || !sets || !sets.length) return null;
    if (isBaseline(kind, sg)) return 'baseline';
    var n = kind === 'min' ? 1 : ((sg.reps && sg.reps.length) || 0);
    if (kind === 'min') {
      var m = +sets[0].w || 0;
      if (m > sg.mins) return 'beat';
      if (m >= sg.mins) return 'hit';
      return 'missed';
    }
    var anyBeat = false, anyMiss = n && sets.length < n;
    for (var i = 0; i < sets.length; i++) {
      var s = sets[i], tr = sg.reps ? sg.reps[Math.min(i, sg.reps.length - 1)] : 0;
      if (kind === 'none') {
        if (s.r > tr) anyBeat = true;
        else if (s.r < tr) anyMiss = true;
      } else if ((s.w || 0) > sg.w || ((s.w || 0) === sg.w && s.r > tr)) anyBeat = true;
      else if ((s.w || 0) < sg.w || s.r < tr) anyMiss = true;
    }
    if (anyMiss) return 'missed';
    if (anyBeat) return 'beat';
    return 'hit';
  }

  function formatWorkout(o) {
    if (!o || !o.name) return 'No workout logged on this day.';
    var lines = [];
    lines.push('Recovery session — ' + o.dateLabel);
    lines.push(o.name + ' · Whoop ' + cap(o.whoop || 'green'));
    if (o.lastSession) lines.push('Last session: ' + o.lastSession.ago + ' (' + o.lastSession.dateLabel + ')');
    else lines.push('Last session: none (first one logged)');
    lines.push('');
    (o.exercises || []).forEach(function (ex) {
      var vs = ex.vs || 'hit';
      if (vs === 'baseline') vs = 'baseline set';
      lines.push(ex.name + ' — ' + vs);
      if (ex.setsLine) lines.push('  ' + ex.setsLine);
      if (ex.targetLine && vs !== 'baseline set') lines.push('  Target was ' + ex.targetLine);
      if (ex.prs && ex.prs.length) lines.push('  PR: ' + ex.prs.join(', '));
      if (ex.pain) lines.push('  Pain flagged');
      if (ex.notes) lines.push('  Note: ' + ex.notes);
      lines.push('');
    });
    if (o.skipped && o.skipped.length) {
      lines.push('Skipped: ' + o.skipped.join('; '));
      lines.push('');
    }
    if (o.feel) { lines.push('How it felt: ' + o.feel); lines.push(''); }
    if (o.notes) { lines.push('Notes: ' + o.notes); lines.push(''); }
    if (o.warmup) {
      var wu = String(o.warmup);
      lines.push(/^warm-up:/i.test(wu) ? wu : 'Warm-up: ' + wu);
    }
    if (o.rom) lines.push('ROM today: ' + (o.rom.done ? 'yes (' + o.rom.count + ' of ' + o.rom.target + ')' : 'no'));
    if (o.nextLine) { lines.push(''); lines.push('Next time (Whoop green): ' + o.nextLine); }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function formatWeekly(o) {
    o = o || {};
    var lines = [];
    lines.push('Recovery week — ' + (o.rangeLabel || 'last 7 days'));
    if (o.checkupLine) lines.push(o.checkupLine);
    lines.push('');
    var n = (o.sessions || []).length;
    lines.push('Sessions: ' + n + ' (prev 7 days: ' + (o.sessionsPrev || 0) + ')');
    if (n) (o.sessions || []).forEach(function (s) { lines.push('  ' + s.dateLabel + ' — ' + s.name); });
    else lines.push('  No lifting sessions this week.');
    lines.push('');
    var volLine = 'Volume: ' + fmtNum(o.vol || 0) + ' lb';
    if (o.volPrev) {
      var p = Math.round(((o.vol || 0) - o.volPrev) / o.volPrev * 100);
      volLine += ' (prev ' + fmtNum(o.volPrev) + ' lb, ' + (p >= 0 ? '+' : '') + p + '%)';
    }
    lines.push(volLine);
    lines.push('Sets: ' + (o.sets || 0) + (o.setsPrev != null ? ' (prev ' + o.setsPrev + ')' : ''));
    if (o.prs && o.prs.length) lines.push('PRs: ' + o.prs.length + ' — ' + o.prs.join('; '));
    else lines.push('PRs: none');
    if (o.pain && o.pain.length) lines.push('Pain flagged: ' + o.pain.map(function (p) { return p.name + ' (' + p.dateLabel + ')'; }).join('; '));
    else lines.push('Pain flagged: none');
    var days = o.days || 7;
    lines.push('ROM: ' + (o.romDays || 0) + ' of ' + days + ' days logged' + (o.romSessions ? ' (' + o.romSessions + ' sessions)' : ''));
    if (o.missed && o.missed.length) lines.push('Missed targets: ' + o.missed.map(function (m) { return m.name + ' (' + m.dateLabel + ')'; }).join('; '));
    else lines.push('Missed targets: none');
    if (o.notDone && o.notDone.length) lines.push('Not done this week: ' + o.notDone.join(', '));
    return lines.join('\n').trim() + '\n';
  }

  var api = { skipNudge: skipNudge, formatSets: formatSets, formatTarget: formatTarget, compactTarget: compactTarget, vsTarget: vsTarget, isBaseline: isBaseline, formatWorkout: formatWorkout, formatWeekly: formatWeekly };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.COACH = api;
})(this);
