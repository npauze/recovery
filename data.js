/* Seed content: program, exercise library, rehab content.
   General guidance only, built around the surgeon's stated limits. Not PT or medical advice. */
window.SEED = (function () {
  'use strict';
  var L = [];
  // safety: safe = left arm not involved; caution = OK only if the left arm stays fully passive;
  // avoid = loads, grips, or braces with the left arm (not until cleared)
  function lib(id, name, cat, kind, safety, notes) {
    L.push({ id: id, name: name, cat: cat, kind: kind, safety: safety, notes: notes });
  }
  // Quads / squat pattern
  lib('belt-squat', 'Belt squat', 'quads', 'lb', 'safe', 'Load the belt, not your hands. If the machine has handles, guide with the right only.');
  lib('hack-squat', 'Hack squat', 'quads', 'lb', 'caution', "Back on the pad. Don't hang on the left handle.");
  lib('leg-press', 'Leg press', 'quads', 'lb', 'safe', 'Feet only. Left arm in your lap, not on the handles.');
  lib('sl-leg-press', 'Single-leg press', 'quads', 'lb', 'safe', 'One leg at a time. Left arm in your lap, not on the handles.');
  lib('v-squat', 'V-squat / pendulum (machine)', 'quads', 'lb', 'caution', 'Machine only. No barbell on the back. Left hand off the handles.');
  lib('leg-ext', 'Leg extension', 'quads', 'lb', 'safe', 'Selectorized. No need to grip with the left.');
  lib('sl-leg-ext', 'Single-leg extension', 'quads', 'lb', 'safe', 'One leg at a time.');
  lib('walk-lunge-r', 'Walking lunge, DB in right hand', 'quads', 'lb', 'safe', 'Dumbbell in the right hand only. Left arm relaxed. 8/leg.');
  lib('bss-r', 'Bulgarian split squat, DB in right hand', 'quads', 'lb', 'safe', 'Rear foot on a bench. Weight in the right hand only.');
  lib('rev-lunge-r', 'Reverse lunge, DB in right hand', 'quads', 'lb', 'safe', 'Step back. Left arm stays relaxed. 8/leg.');
  lib('bw-split-squat', 'Bodyweight split squat', 'quads', 'none', 'safe', 'No load if lunges feel awkward to balance.');
  lib('step-up-r', 'Step-up, DB in right hand', 'quads', 'lb', 'safe', 'Low box. Weight in the right hand only. Left arm relaxed.');
  lib('bb-back-squat', 'Barbell back squat', 'quads', 'lb', 'avoid', 'Both hands hold and brace the bar. Not until cleared.');
  lib('smith-squat', 'Smith machine squat', 'quads', 'lb', 'avoid', 'Both hands on the bar. Not until cleared.');
  // Hamstrings / hinge
  lib('seated-curl', 'Seated leg curl', 'hams', 'lb', 'safe', 'Selectorized machine. No gripping with the left.');
  lib('lying-curl', 'Lying leg curl', 'hams', 'lb', 'safe', 'Same pattern, different machine. Left hand off the handles.');
  lib('sl-curl', 'Single-leg curl', 'hams', 'lb', 'safe', 'Same machine, one leg at a time.');
  lib('back-ext', '45° back extension, arms crossed', 'hams', 'none', 'caution', "Arms across the chest. Don't push off with the left getting in or out.");
  lib('deadlift', 'Two-hand deadlift / RDL', 'hams', 'lb', 'avoid', 'Grips and loads the left arm. Not until cleared.');
  // Hips / glutes
  lib('hip-abd', 'Hip abduction machine', 'hips', 'lb', 'safe', 'Sit tall. Hands off, or right hand only for balance.');
  lib('hip-add', 'Hip adduction machine', 'hips', 'lb', 'safe', 'Same setup rules.');
  lib('cable-abd', 'Cable hip abduction, ankle cuff', 'hips', 'lb', 'safe', "Ankle cuff. Right hand on the frame if needed. Don't hold on with the left.");
  lib('glute-kick', 'Glute kickback machine', 'hips', 'lb', 'caution', 'Chest pad only. Left arm relaxed, not bracing.');
  lib('hip-thrust-machine', 'Hip thrust machine', 'hips', 'lb', 'caution', 'Belt or pad over the hips. Left hand off the handles.');
  lib('glute-bridge', 'Glute bridge', 'hips', 'none', 'safe', 'On your back, feet planted. No weight, or a light pad on the hips set with the right hand.');
  lib('sl-glute-bridge', 'Single-leg glute bridge', 'hips', 'none', 'safe', 'One leg at a time. No weight in the left hand.');
  lib('cable-kickback', 'Cable glute kickback, ankle cuff', 'hips', 'lb', 'safe', 'Ankle cuff, not a handle. Right hand on the frame if needed. Left arm relaxed.');
  lib('reverse-hyper', 'Reverse hyper', 'hips', 'lb', 'caution', 'Lie on the pad. Hold the handles lightly with the right only; left arm off and unloaded.');
  lib('sl-rdl-r', 'Single-leg RDL, DB in right hand', 'hams', 'lb', 'safe', 'Dumbbell in the right hand only. Left arm relaxed. 8/leg.');
  lib('nordic-curl', 'Nordic hamstring curl', 'hams', 'none', 'safe', 'Hook your heels; no need to use the left arm. Shorten the range if you cannot control the lower.');
  // Calves
  lib('seated-calf', 'Seated calf raise', 'calves', 'lb', 'safe', "Machine pad on the knees. Don't hold a heavy DB in the left hand.");
  lib('lp-calf', 'Leg-press calf raise', 'calves', 'lb', 'safe', 'Feet on the lower edge; hands off the handles.');
  lib('standing-calf', 'Standing calf machine', 'calves', 'lb', 'safe', 'Shoulders under the pads. No heavy left-hand grip.');
  // Core
  lib('dead-bug', 'Dead bugs', 'core', 'none', 'safe', 'Slow. Low back stays down. 8/side. No weight in the left hand.');
  lib('heel-taps', 'Heel taps', 'core', 'none', 'safe', 'On your back, small range, no reaching with the left.');
  lib('bench-leg-raise', 'Bench leg raises', 'core', 'none', 'caution', 'Right hand may lightly hold the bench; left stays off and unloaded.');
  lib('decline-situp', 'Decline sit-ups, arms crossed', 'core', 'none', 'safe', 'Arms across the chest. No plate in the left hand.');
  lib('machine-crunch', 'Machine crunch (pads)', 'core', 'lb', 'caution', 'Use pads, not handles or a rope, if both arms would have to pull.');
  lib('cable-crunch', 'Cable crunch, left arm passive', 'core', 'lb', 'caution', 'Only if the left arm stays completely unloaded: no pulling, no hanging on the rope.');
  lib('pallof-r', 'Pallof press, right only', 'core', 'lb', 'caution', 'Light to moderate, standing or half-kneeling. Skip if the left arm starts to brace.');
  lib('suitcase-hold-r', 'Suitcase hold, right hand', 'core', 'lb', 'safe', 'Short holds. Left arm free. No left-hand carry.');
  lib('plank', 'Hand or forearm plank', 'core', 'none', 'avoid', 'Puts body weight through the left arm. Not until cleared.');
  lib('hanging-raise', 'Hanging leg raise', 'core', 'none', 'avoid', 'Hanging loads the repair. Not until cleared.');
  lib('bird-dog', 'Bird-dog', 'core', 'none', 'avoid', 'Weight goes through the left hand. Not until cleared.');
  // Push (right)
  lib('machine-press-r', 'Single-arm machine chest press, right', 'push', 'lb', 'safe', 'Right arm only. Left hand off the handle, arm resting on your torso.');
  lib('db-bench-r', 'Single-arm DB bench, right', 'push', 'lb', 'caution', 'Left arm rests on your torso. Do not use it to brace on the bench.');
  lib('landmine-r', 'Landmine press, right', 'push', 'lb', 'safe', 'Right hand only. Left arm relaxed at your side.');
  lib('pec-deck-r', 'Pec deck, right only', 'push', 'lb', 'caution', 'Use one arm if the machine allows; otherwise use a swap.');
  lib('db-ohp-r', 'Seated single-arm DB press, right', 'push', 'lb', 'safe', 'Back supported. Left arm in your lap.');
  lib('pushup', 'Push-ups', 'push', 'none', 'avoid', 'Body weight on the left arm. Not until cleared.');
  lib('bb-bench', 'Barbell bench press', 'push', 'lb', 'avoid', 'Two-hand grip loads the left arm. Not until cleared.');
  lib('dips', 'Dips', 'push', 'none', 'avoid', 'Full body weight on both arms. Not until cleared.');
  // Pull (right)
  lib('cs-row-r', 'Chest-supported row, right arm', 'pull', 'lb', 'safe', 'Chest on the pad so the left arm does not brace. Right arm only.');
  lib('cable-row-r', 'Single-arm cable row, right', 'pull', 'lb', 'safe', 'Seated; left arm in your lap. Do not hold the stack or bench with the left.');
  lib('machine-row-r', 'Single-arm machine row, right', 'pull', 'lb', 'safe', 'Chest or stomach supported. Left hand off.');
  lib('pulldown-r', 'Single-arm lat pulldown, right', 'pull', 'lb', 'caution', 'Thigh pad holds you down. Left arm in your lap, not on the frame.');
  lib('pullup', 'Pull-ups / chin-ups', 'pull', 'none', 'avoid', 'Hanging and pulling load the repair. Not until cleared.');
  lib('two-arm-row', 'Two-arm row (any)', 'pull', 'lb', 'avoid', 'Left arm pulls. Not until cleared.');
  // Delts (right)
  lib('lat-raise-r', 'Single-arm lateral raise, right', 'delts', 'lb', 'safe', 'Cable or DB, right only.');
  lib('machine-lat-r', 'Machine lateral raise, right', 'delts', 'lb', 'safe', 'Right arm only if the machine is independent.');
  lib('cable-lat-r', 'Cable lateral raise, right', 'delts', 'lb', 'safe', 'Stand clear of the stack; left arm relaxed.');
  lib('rear-delt-r', 'Cable rear-delt fly, right', 'delts', 'lb', 'safe', 'Right arm only. Left arm relaxed at your side.');
  // Arms (right)
  lib('curl-r', 'Single-arm curl, right', 'arms', 'lb', 'safe', 'DB, cable, or preacher, right only. Left side stays unloaded ROM, not a matching set.');
  lib('cable-curl-r', 'Cable curl, right', 'arms', 'lb', 'safe', 'Right hand only; left arm at your side.');
  lib('preacher-r', 'Machine preacher curl, right', 'arms', 'lb', 'safe', 'One arm. Do not load the left.');
  lib('pushdown-r', 'Single-arm cable pushdown, right', 'arms', 'lb', 'safe', "Right arm only. Don't use the left to steady the cable.");
  lib('kickback-r', 'Single-arm DB kickback, right', 'arms', 'lb', 'caution', 'Hinge and keep the left arm hanging relaxed. Don\u2019t brace on the bench with the left.');
  lib('tri-machine-r', 'One-arm triceps machine, right', 'arms', 'lb', 'safe', 'If the station is independent; otherwise use a swap.');
  lib('left-curl', 'Left-arm curl or supination, loaded', 'arms', 'lb', 'avoid', 'Resisted left curls/supination are off until your surgeon clears them.');
  lib('farmer-carry', 'Farmer carry, both hands', 'arms', 'lb', 'avoid', 'Heavy left-hand grip. Not until cleared.');
  // Cardio
  lib('bike', 'Stationary bike, hands-free', 'cardio', 'min', 'safe', "Hands on your thighs or the seat, not the bars, if you'd be leaning on the left.");
  lib('recumbent', 'Recumbent bike', 'cardio', 'min', 'safe', 'Easy default. Keep the left arm in your lap.');
  lib('incline-walk', 'Incline walk, hands-free', 'cardio', 'min', 'safe', "Light or no rail use. Don't grip with the left.");
  lib('stairs', 'Stair climber, hands-free', 'cardio', 'min', 'caution', "Only if balance is solid. Don't hang on the rails.");
  lib('sled', 'Sled push / pull', 'cardio', 'min', 'avoid', 'Loads both arms. Not until cleared.');
  lib('rower', 'Rowing machine', 'cardio', 'min', 'avoid', 'Pulls with both arms. Not until cleared.');
  lib('air-bike-arms', 'Air bike using the handles', 'cardio', 'min', 'avoid', 'Push/pull with both arms. Use hands-free bikes instead.');

  function it(ex, sets, reps, load, note, alts) {
    return { ex: ex, sets: sets, reps: reps, load: load, note: note || '', alts: alts || [] };
  }

  var days = [
    {
      id: 'quads-push', name: 'Quads + Push',
      focus: 'Quad-dominant machines and single-leg work, plus a short right-arm press block. Left arm stays in your lap or relaxed at your side.',
      items: [
        it('belt-squat', 3, 10, 0, '', ['hack-squat', 'leg-press', 'v-squat']),
        it('leg-press', 3, 10, 0, '', ['sl-leg-press', 'hack-squat']),
        it('walk-lunge-r', 3, 8, 0, '', ['bss-r', 'rev-lunge-r', 'bw-split-squat', 'step-up-r']),
        it('leg-ext', 3, 12, 0, '', ['sl-leg-ext']),
        it('machine-press-r', 3, 10, 0, '', ['db-bench-r', 'landmine-r', 'pec-deck-r']),
        it('lat-raise-r', 3, 12, 0, '', ['machine-lat-r', 'cable-lat-r']),
        it('pushdown-r', 3, 12, 0, '', ['kickback-r', 'tri-machine-r']),
        it('decline-situp', 3, 12, 0, 'Arms across the chest. No plate in the left hand.', ['heel-taps', 'dead-bug', 'machine-crunch']),
        it('pallof-r', 3, 10, 0, 'Light to moderate, standing or half-kneeling. Skip if the left arm starts to brace.', ['suitcase-hold-r', 'dead-bug', 'machine-crunch'])
      ]
    },
    {
      id: 'hams-pull', name: 'Hams + Pull',
      focus: 'Hamstring and hinge work, plus a short right-arm pull block. Left arm stays unloaded and does not brace or grip.',
      items: [
        it('seated-curl', 3, 12, 0, '', ['lying-curl', 'sl-curl']),
        it('sl-rdl-r', 3, 8, 0, '8/leg. Dumbbell in the right hand only.', ['back-ext', 'reverse-hyper']),
        it('back-ext', 3, 10, 0, "Arms across the chest. Don't push off with the left getting in or out.", ['reverse-hyper', 'sl-rdl-r']),
        it('sl-curl', 3, 10, 0, '10/leg.', ['lying-curl', 'seated-curl', 'nordic-curl']),
        it('cs-row-r', 3, 10, 0, '', ['cable-row-r', 'machine-row-r']),
        it('rear-delt-r', 3, 12, 0, '', ['cable-row-r']),
        it('curl-r', 3, 10, 0, '', ['cable-curl-r', 'preacher-r']),
        it('machine-crunch', 3, 12, 0, 'Use pads, not handles.', ['cable-crunch', 'decline-situp', 'dead-bug']),
        it('heel-taps', 3, 10, 0, 'On your back, small range, no reaching with the left.', ['dead-bug', 'decline-situp', 'bench-leg-raise'])
      ]
    },
    {
      id: 'glutes-push', name: 'Glutes + Push',
      focus: 'Glute-focused hip work, then the same right-arm press block as Quads + Push. Left hand stays off handles and pads.',
      items: [
        it('hip-thrust-machine', 3, 10, 0, 'Belt or pad over the hips. Left hand off the handles.', ['glute-bridge', 'sl-glute-bridge']),
        it('bss-r', 3, 8, 0, '8/leg. Weight in the right hand only.', ['step-up-r', 'walk-lunge-r', 'rev-lunge-r']),
        it('glute-kick', 3, 12, 0, 'Chest pad only. Left arm relaxed, not bracing.', ['cable-kickback', 'cable-abd']),
        it('hip-abd', 3, 12, 0, '', ['cable-abd', 'hip-add']),
        it('machine-press-r', 3, 10, 0, '', ['db-bench-r', 'landmine-r', 'pec-deck-r']),
        it('lat-raise-r', 3, 12, 0, '', ['machine-lat-r', 'cable-lat-r']),
        it('pushdown-r', 3, 12, 0, '', ['kickback-r', 'tri-machine-r']),
        it('dead-bug', 3, 8, 0, 'Slow. Low back stays down. 8/side. No weight in the left hand.', ['heel-taps', 'bench-leg-raise', 'pallof-r']),
        it('bench-leg-raise', 3, 10, 0, 'Right hand may lightly hold the bench; left stays off and unloaded.', ['dead-bug', 'heel-taps', 'decline-situp']),
        it('incline-walk', 1, 1, 10, 'Optional 8–10 min hands-free finisher. No gripping the rails with the left.', ['bike', 'recumbent'])
      ]
    },
    {
      id: 'quads-hams-pull', name: 'Quads & Hams + Pull',
      focus: 'Moderate quad and hamstring volume, a short right-arm pull block, and core. Not another heavy squat day. Same left-arm rules.',
      items: [
        it('hack-squat', 3, 12, 0, "Back on the pad. Don't hang on the left handle.", ['belt-squat', 'leg-press', 'v-squat']),
        it('sl-leg-press', 2, 10, 0, '10/leg. Left arm in your lap, not on the handles.', ['rev-lunge-r', 'bss-r', 'leg-press']),
        it('lying-curl', 3, 12, 0, 'Controlled reps. No left-hand gripping.', ['seated-curl', 'sl-curl', 'nordic-curl']),
        it('seated-calf', 3, 12, 0, '', ['lp-calf', 'standing-calf']),
        it('cs-row-r', 3, 10, 0, '', ['cable-row-r', 'machine-row-r']),
        it('curl-r', 3, 10, 0, '', ['cable-curl-r', 'preacher-r']),
        it('dead-bug', 2, 8, 0, '', ['heel-taps', 'bench-leg-raise', 'pallof-r']),
        it('decline-situp', 3, 12, 0, 'Arms across the chest. No plate in the left hand.', ['heel-taps', 'dead-bug', 'machine-crunch']),
        it('bike', 1, 1, 10, 'Optional 8–12 min hands-free finisher. No leaning or hanging on the left arm.', ['incline-walk', 'recumbent'])
      ]
    }
  ];

  // Default rest between sets, in seconds. Rule by muscle group, with per-exercise overrides.
  // 0 = no rest timer (cardio and other timed items). ROM/rehab work is not in the library and never gets one.
  var rest = {
    byCat: { quads: 150, hams: 150, hips: 150, calves: 75, core: 60, push: 90, pull: 90, delts: 75, arms: 75, cardio: 0, other: 90 },
    byId: {
      // big compound lower-body lifts and the chest press: 150
      'hack-squat': 150, 'leg-press': 150, 'belt-squat': 150, 'hip-thrust-machine': 150, 'bss-r': 150, 'step-up-r': 150,
      'sl-rdl-r': 150, 'seated-curl': 150, 'lying-curl': 150, 'machine-press-r': 150, 'db-bench-r': 150,
      // single-leg / lighter lower-body work: 90
      'sl-curl': 90, 'sl-leg-press': 90, 'glute-bridge': 90, 'sl-glute-bridge': 90, 'bw-split-squat': 90,
      // isolation: 75
      'leg-ext': 75, 'sl-leg-ext': 75, 'back-ext': 75, 'hip-abd': 75, 'hip-add': 75, 'cable-abd': 75,
      'glute-kick': 75, 'cable-kickback': 75, 'reverse-hyper': 75, 'pec-deck-r': 75,
      // core: 45-60
      'dead-bug': 45, 'heel-taps': 45, 'bench-leg-raise': 60, 'decline-situp': 60, 'machine-crunch': 60,
      'cable-crunch': 60, 'pallof-r': 45, 'suitcase-hold-r': 45
    }
  };
  // ex: a library entry ({id, cat, kind}). Returns default rest seconds (0 = no timer).
  rest.forEx = function (ex) {
    if (!ex) return 90;
    if (ex.kind === 'min' || ex.cat === 'cardio') return 0;
    if (Object.prototype.hasOwnProperty.call(rest.byId, ex.id)) return rest.byId[ex.id];
    var c = rest.byCat[ex.cat];
    return c == null ? 90 : c;
  };

  var rehab = {
    rom: [
      ['Elbow flexion and extension', "Gentle, slow, active motion. Don't force end range or add weight."],
      ['Slow pronation and supination', 'Unloaded. Elbow at your side. Turn the palm up and down without resistance.'],
      ['Soft grip squeezes', 'Towel or a soft ball. Easy squeezes only, not a hard crush. Stop at any pain.'],
      ['Wrist mobility', 'Easy circles, flexion, and extension. No added load.'],
      ['Shoulder mobility', "Pendulums or easy scap squeezes. Don't plant the left hand or hang from it."]
    ],
    redFlags: ['Sharp pain', 'A pop or sudden give', 'New swelling or bruising', 'Numbness or tingling', 'Fever, or wound redness, drainage, or opening'],
    phases: [
      ['Weeks 0–2', 'Protection, swelling control, and only the motion your surgeon allowed. No training load on the left arm.', 0, 14],
      ['Weeks 2–6', 'Work toward full, pain-free ROM. Left arm under the cap. Train legs, core, right arm, and cardio hard within the hard stops.', 14, 42],
      ['Weeks 6–12', 'Only after surgeon clearance. If cleared, this is typically when a gradual strengthening plan can start. Do not begin it on your own.', 42, 84],
      ['Weeks 12+', 'Typically a slower return toward normal two-arm loading, if and when cleared. Still up to the surgeon, not this app.', 84, 9999]
    ],
    offLimits: [
      'Push-ups, hand planks, dips, pull-ups, hanging, bird-dog',
      'Barbell back squat, two-hand deadlift, left-arm or two-arm rows',
      'Sled push, rower, or anything you have to hang on to with the left arm',
      'Left-arm load over the cap, or resisted left grip, curl, or supination'
    ],
    useThese: [
      'Belt squat, hack squat, leg press, leg extension and curl, calf machines',
      'Hip thrust machine, glute kickback, hip abduction, glute bridges',
      'Single-leg work with a DB in the right hand, or no load',
      'Right-arm only press, row, raise, curl, and landmine',
      'Dead bugs, cautious right-hand Pallof, decline sit-ups, bench leg raises',
      'Bike, incline walk, or stair climber with the left arm unloaded'
    ],
    habits: [
      ['protein', 'Protein ~1 g/lb goal bodyweight'],
      ['sleep', 'Sleep ~8 hours'],
      ['collagen', 'Collagen 15 g + vitamin C (optional)']
    ],
    questions: [
      'Can the left-arm load cap move past ~8 lb, and if so, to what?',
      'When can I start light resisted left elbow flexion or supination?',
      'Brace: keep it, wean it, or any remaining ROM limit?',
      'Do you want me in formal PT now?',
      'When are two-hand lifts, rows, planks, or pull-ups on the table?',
      'Any limits on gripping, carrying, driving, or work?',
      'What symptoms mean I overdid it and should call?',
      'Are light isometrics or bands on the left okay after this visit?'
    ]
  };

  return { library: L, days: days, rehab: rehab, rest: rest };
})();
