// The input layer: keyboard, the strike/kick/dodge/guard buttons (the thumb cluster), the sprint button and the
// joystick, folded into one intent per tick for the simulation. At most one edge-triggered action per tick plus the held guard level;
// the simulation owns legality and buffering. Everything the layer touches is injected — the DOM lookup, window, clock, media
// query, viewport width — so the entry point's own globals (and the VM harness's fakes in tests/graphics.test.ts) are what it binds to.
import { accepts, type Action, type CombatEvent, type Practice } from './combat.ts';
import type { Direction } from './moves.ts';

type Lookup = <T extends HTMLElement>(id: string) => T;
export type InputEnv = {
  element: Lookup;
  window: Pick<Window, 'addEventListener'>;
  now: () => number;
  matchMedia: (query: string) => { matches: boolean };
  innerWidth: () => number;
  paused: () => boolean;
  ready: () => boolean;      // assets loaded and graphics up: only then do presses reach the simulation
  practice: () => Practice;
  quiet: () => void;         // feedback.quiet — clearing input also silences pending cues
  press?: () => void;        // any fight-button press, before it is read: the Coach hands the fight over here (src/coach-ui.ts)
};
// The controls' intent for one frame, named apart from the simulation's `Intent` (duel.ts) it is folded into by main.ts: the two
// shapes differ (stick axes here, a camera-relative move plus lock there) and sharing a name at that seam misled the audit twice.
export type ControlIntent = { x: number; z: number; run: boolean; action: Action | null; guard: boolean; guardDirection: Direction | null; held: boolean; cancel: boolean };
// Guard side (owner 2026-09-20, five sides): the thumb still on the Guard button is the straight guard (null: the simulation reads it as the
// stab's side); slid past GUARD_SLIDE_PX it is that side — left, right, up = overhead, down = low. Keyboard: Q held + an arrow key.
// Hysteresis (brief 7, 2026-09-21): the sectors meet on the diagonals, and a thumb wobbling near one flipped the side every frame. A side
// already held keeps its axis until the thumb is GUARD_DEAD_BAND_DEG past the diagonal into the next sector; a fresh slide (no side
// held) picks the dominant axis as before. Intent only — nothing about parry timing, block cost or the exposure changes.
export const GUARD_SLIDE_PX = 18, GUARD_DEAD_BAND_DEG = 15;
export const guardSide = (dx: number, dy: number, held: Direction | null = null): Direction | null => {
  if (!(Math.hypot(dx, dy) >= GUARD_SLIDE_PX)) return null;
  const fromHorizontal = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;   // 0 = along the horizontal axis, 90 = along the vertical
  const horizontal = held === 'left' || held === 'right' ? fromHorizontal < 45 + GUARD_DEAD_BAND_DEG : held === 'overhead' || held === 'low' ? fromHorizontal < 45 - GUARD_DEAD_BAND_DEG : Math.abs(dx) > Math.abs(dy);
  return horizontal ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'overhead' : 'low';
};
// Directional cuts (Dom GO 2026-10-07; the strike circle's flick did this until 226456f9 retired it, and the sim never stopped taking both): LIGHT pressed while the
// move stick, A/D or the arrows are held to a side cuts to that side; held neutral keeps the alternating light. Intent only: the sim already accepts light_left and light_right.
export const CUT_PUSH = 0.4;   // the stick's own dead zone is 0.12; a side cut wants a deliberate push, not a wobble
export const cutAction = (lateral: number): Action => (lateral <= -CUT_PUSH ? 'light_left' : lateral >= CUT_PUSH ? 'light_right' : 'light');
// Slash's cut side is the thumb's slide on the SLASH button (Dom 2026-10-07: "slide left, see the gold arc, and then I will slash left"). The swing waits for the thumb:
// it fires on a slide of SLASH_SLIDE_PX (that side, at once), on release, or after SLASH_DECIDE_MS (the alternating light), whichever comes first. A plain tap
// therefore gets up to SLASH_DECIDE_MS later; change the one constant to trade it. Intent only: the sim already takes light_left / light_right.
export const SLASH_SLIDE_PX = 14, SLASH_DECIDE_MS = 50;
export const slashSlide = (dx: number): 'left' | 'right' | null => (dx <= -SLASH_SLIDE_PX ? 'left' : dx >= SLASH_SLIDE_PX ? 'right' : null);
export const cutSideOf = (action: Action): 'left' | 'right' | null => (action === 'light_left' ? 'left' : action === 'light_right' ? 'right' : null);   // the side a cut press goes to; neutral LIGHT is null (no flash)
const ARROW_SIDE: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'overhead', ArrowDown: 'low' };

// Dodge control: the press is an instant backstep; holding it past HOLD_MS grows the step into a roll. Swipe-down rolls directly.
export const HOLD_MS = 150,
  SPRINT_PUSH = 1.4;
// Strike controls: the press swings at once; keeping it held charges (Heavy), loads (Stab) or chambers (Slash) the swing — the simulation owns
// the timing. The held level belongs to the control that raised it: releasing one never drops another's. Dragging a held strike off its
// circle turns the press into a guard press (a feint inside the wind-up's feint window, a parry or a raised guard after it) until it lifts.
type Strike = 'light' | 'heavy' | 'thrust';
const ownerOf = (move: string | null): Strike | null =>
  move === 'heavy_overhead'
    ? 'heavy'
    : move === 'thrust'
      ? 'thrust'
      : move?.startsWith('light_')
        ? 'light'
        : null;
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];

export function createInput(env: InputEnv) {
  const { element, paused } = env;
  const attackButton = element<HTMLButtonElement>('attack-button');
  const kickButton = element<HTMLButtonElement>('kick-button');
  const heavyButton = element<HTMLButtonElement>('heavy-button');
  const skillButton = element<HTMLButtonElement>('skill-button');
  const dodgeButton = element<HTMLButtonElement>('dodge-button');
  const guardButton = element<HTMLButtonElement>('guard-button');
  const thrustButton = element<HTMLButtonElement>('thrust-button');
  const runButton = element<HTMLButtonElement>('run-button');
  const joystick = element('joystick');
  const stick = element('stick');
  let action: Action | null = null,
    guard = false,
    guardId: number | null = null,
    guardFrom: { x: number; y: number } | null = null,
    guardDir: Direction | null = null,
    cancel = false;
  let dodgeHeld: { since: number; rolled: boolean } | null = null;
  let slashWait: { since: number; x: number } | null = null;   // a SLASH press still deciding its side (see slashSlide)
  const holders = new Set<Strike>();
  let dragGuard = false;
  // The held level the simulation sees: during a swing, whether the control that threw it is still down; otherwise whether any strike control is.
  const held = () => {
    const f = env.practice().duel.fighters[0],
      owner = f.phase === 'attack' ? ownerOf(f.move) : null;
    return owner ? holders.has(owner) : holders.size > 0;
  };
  function hold(by: Strike) {
    holders.add(by);
  }
  function unhold(by: Strike) {
    holders.delete(by);
  }
  function request(next: Action) {
    if (!paused() && env.ready()) env.press?.();
    if (!paused() && env.ready() && accepts(env.practice(), next)) action = next;
  }
  // Directional-cut flash (Dom 2026-10-07: "an indicator which comes at the same time, not before, but faint"): restart the CSS animation on the chosen edge; it removes itself.
  function flashCut(next: Action) {
    const side = cutSideOf(next);
    if (!side) return;
    delete attackButton.dataset.flash; void attackButton.offsetWidth; attackButton.dataset.flash = side;
  }
  attackButton.addEventListener('animationend', (event) => { if ((event as AnimationEvent).animationName === 'cut-flash') delete attackButton.dataset.flash; });
  function requestKick() {
    request('kick');
  }
  // SKILL: a press casts the equipped move (no hold, no charge, like Heavy's press without the charge); legal() refuses it with no
  // move equipped, while it cools or below its stamina, as it refuses any move the player cannot make.
  function requestSkill() {
    request('skill');
  }
  let run = false,
    stickRun = false,
    moveId: number | null = null;
  let moveX = 0,
    moveZ = 0;
  const keys = new Set<string>();
  // Step: a tap is a backstep, a hold (150 ms) becomes a roll. With the stick already deflected (or a movement key down) the intent is a roll in
  // that direction, so it rolls at once: the invulnerability arrives with the press, not 150 ms later.
  const arrowKey = (code: string) => !keys.has('KeyQ') && keys.has(code);   // Q held turns the arrows into the guard side
  const lateral = () => moveX + Number(keys.has('KeyD') || arrowKey('ArrowRight')) - Number(keys.has('KeyA') || arrowKey('ArrowLeft'));
  // The side a cut takes from the KEYBOARD (A/D or the arrows): the on-screen stick is movement only (Dom 2026-10-07); the touch cut side is the thumb's slide on SLASH.
  const cutLateral = () => Number(keys.has('KeyD') || arrowKey('ArrowRight')) - Number(keys.has('KeyA') || arrowKey('ArrowLeft'));
  const moving = () => moveX !== 0 || moveZ !== 0 || MOVE_KEYS.some((k) => keys.has(k));
  function pressDodge(now: number) {
    if (dodgeHeld) return;
    const roll = moving();
    dodgeHeld = { since: now, rolled: roll };
    request(roll ? 'dodge' : 'backstep');
  }
  // Releasing a control only drops its held level; a queued press survives until the next tick consumes it. Only a cancelled pointer
  // (pointercancel, focus loss) withdraws the press: lostpointercapture follows every ordinary pointerup and must not eat a quick tap.
  // A press the simulation has already taken into its buffer is withdrawn there too (`cancel`), but only if that control owns the
  // buffered request — a cancelled thumb must not erase another finger's valid press.
  let sent: Action | null = null; // the last request handed to the simulation (the one its buffer can hold)
  function withdraw(owned: Action | Action[]) {
    const mine = ([] as Action[]).concat(owned);
    if (action && mine.includes(action)) action = null;
    else if (sent && mine.includes(sent)) cancel = true;
  }
  function releaseDodge(cancelled = false) {
    dodgeHeld = null;
    if (cancelled) withdraw(['backstep', 'dodge']);
  }
  function requestParry() {
    request('parry');
  }
  function fireSlash(side: 'left' | 'right' | null) {
    slashWait = null;
    if (side) { attackButton.dataset.slide = side; take(side === 'left' ? 'light_left' : 'light_right'); }
    else requestStrike();
  }
  // Every strike press goes through here: when it is TAKEN, a brief edge flash on the cut side (a thumb slide fires through fireSlash, keys and sticks through requestStrike).
  function take(next: Action) {
    request(next);
    if (action === next) flashCut(next);
  }
  function requestStrike(isHeavy = false) {
    take(isHeavy ? 'heavy' : cutAction(cutLateral()));   // the press goes through take(): flashed only when taken
  }
  env.window.addEventListener('keydown', (event) => {
    if (paused() || (event.target as { tagName?: string } | null)?.tagName === 'INPUT') return; // typing a name is not fighting
    if ([...MOVE_KEYS, 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    }
    if (event.code === 'KeyF' && !event.repeat) {
      event.preventDefault();
      requestStrike();
    }
    if (event.code === 'KeyC' && !event.repeat) {
      event.preventDefault();
      requestKick();
    }
    if (event.code === 'KeyG' && !event.repeat) {
      event.preventDefault();
      hold('heavy');
      requestStrike(true);
    }
    if (event.code === 'KeyT' && !event.repeat) {
      event.preventDefault();
      hold('thrust');
      request('thrust');
    }
    if (event.code === 'KeyE' && !event.repeat) {
      event.preventDefault();
      pressDodge(env.now());
    }
    if (event.code === 'KeyQ') {
      event.preventDefault();
      keys.add(event.code);
      if (!event.repeat) requestParry();
    }
    if (event.code === 'KeyR' && !event.repeat) element('recenter-button').click();
  });
  env.window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
    if (event.code === 'KeyE') releaseDodge();
    if (event.code === 'KeyG') unhold('heavy');
    if (event.code === 'KeyT') unhold('thrust');
  });
  function setRun(value: boolean) {
    run = value;
    runButton.setAttribute('aria-pressed', String(value));
  }
  runButton.addEventListener('pointerdown', (event) => {
    if (!paused()) {
      runButton.setPointerCapture(event.pointerId);
      setRun(true);
    }
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    runButton.addEventListener(name, () => setRun(false));
  runButton.addEventListener('keydown', (event) => {
    if (['Space', 'Enter'].includes(event.code) && !paused()) {
      event.preventDefault();
      setRun(true);
    }
  });
  runButton.addEventListener('keyup', () => setRun(false));
  runButton.addEventListener('blur', () => setRun(false));
  // A strike button with pointer capture: press = strike (held while down); the pointer leaving the circle while down = guard press (drag-off feint).
  function strikeControl(
    button: HTMLButtonElement,
    name: Strike,
    start: () => void,
    deferred = false,   // SLASH: the swing waits for the thumb's slide (fireSlash) instead of starting on the press
  ) {
    let id: number | null = null,
      dragged = false;
    const radius = () => {
      const r = button.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 + 6 };
    }; // 6 px of slack before a press counts as dragged off
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || id !== null) return;
      event.preventDefault();
      id = event.pointerId;
      dragged = false;
      try {
        button.setPointerCapture(id);
      } catch {
        /* capture is a convenience: an uncaptured press still strikes */
      }
      hold(name);
      button.dataset.held = ''; // the button's side mark lights while held (see .side-marks in style.css)
      if (deferred) slashWait = { since: env.now(), x: event.clientX };
      else start();
    });
    button.addEventListener('pointermove', (event) => {
      if (event.pointerId !== id || dragged) return;
      if (deferred && slashWait) { const side = slashSlide(event.clientX - slashWait.x); if (side) { fireSlash(side); return; } }
      const c = radius();
      if (Math.hypot(event.clientX - c.x, event.clientY - c.y) <= c.r) return;
      dragged = true;
      if (deferred) slashWait = null;   // dragged off before it decided: the swing is abandoned into the guard press
      unhold(name);
      dragGuard = true;
      requestParry(); // off the circle: the swing is abandoned into a guard press
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      button.addEventListener(type, (event) => {
        if ((event as PointerEvent).pointerId !== id) return;
        id = null;
        if (deferred && slashWait) { if (type === 'pointerup' && !dragged) fireSlash(null); else slashWait = null; }   // a release decides the plain light
        unhold(name);
        delete button.dataset.held;
        if (deferred) delete button.dataset.slide;
        if (dragged) {
          dragged = false;
          dragGuard = false;
        }
        if (type === 'pointercancel') withdraw(name);
      });
    button.addEventListener('keydown', (event) => {
      if (['Space', 'Enter'].includes(event.code) && !event.repeat) {
        event.preventDefault();
        hold(name);
        button.dataset.held = '';
        start();
      }
    });
    for (const type of ['keyup', 'blur'])
      button.addEventListener(type, () => {
        unhold(name);
        delete button.dataset.held;
      });
  }
  strikeControl(attackButton, 'light', () => requestStrike(), true);
  skillButton.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      event.preventDefault();
      requestSkill();
    }
  });
  skillButton.addEventListener('pointercancel', () => withdraw('skill'));
  skillButton.addEventListener('keydown', (event) => {
    if (['Space', 'Enter'].includes(event.code) && !event.repeat) {
      event.preventDefault();
      requestSkill();
    }
  });
  kickButton.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      event.preventDefault();
      kickButton.dataset.held = '';
      requestKick();
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'keyup', 'blur'])
    kickButton.addEventListener(type, () => delete kickButton.dataset.held);
  kickButton.addEventListener('pointercancel', () => withdraw('kick'));
  kickButton.addEventListener('keydown', (event) => {
    if (['Space', 'Enter'].includes(event.code) && !event.repeat) {
      event.preventDefault();
      kickButton.dataset.held = '';
      requestKick();
    }
  });
  strikeControl(heavyButton, 'heavy', () => requestStrike(true));
  strikeControl(thrustButton, 'thrust', () => request('thrust'));
  dodgeButton.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      event.preventDefault();
      dodgeButton.setPointerCapture(event.pointerId);
      pressDodge(env.now());
    }
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    dodgeButton.addEventListener(name, () => releaseDodge(name === 'pointercancel'));
  dodgeButton.addEventListener('keydown', (event) => {
    if (['Space', 'Enter'].includes(event.code) && !event.repeat) {
      event.preventDefault();
      pressDodge(env.now());
    }
  });
  dodgeButton.addEventListener('keyup', () => releaseDodge());
  dodgeButton.addEventListener('blur', () => releaseDodge(true));
  const showSide = () => { guardButton.dataset.side = guardDir ?? 'straight'; };
  guardButton.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || paused() || guardId !== null) return;
    event.preventDefault();
    guardId = event.pointerId;
    guardButton.setPointerCapture(guardId);
    guardFrom = { x: event.clientX, y: event.clientY };
    guardDir = null; showSide();
    guard = true;
    requestParry();
  });
  guardButton.addEventListener('pointermove', (event) => {
    if (event.pointerId !== guardId || !guardFrom) return;
    const side = guardSide(event.clientX - guardFrom.x, event.clientY - guardFrom.y, guardDir);
    if (side !== guardDir) { guardDir = side; showSide(); }
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    guardButton.addEventListener(name, (event) => {
      if ((event as PointerEvent).pointerId === guardId) {
        guardId = null;
        guardFrom = null;
        guardDir = null; showSide();
        guard = false;
        if (name === 'pointercancel') withdraw('parry');
      }
    });
  guardButton.addEventListener('keydown', (event) => {
    if (['Space', 'Enter'].includes(event.code) && !paused()) {
      event.preventDefault();
      guard = true;
      if (!event.repeat) requestParry();
    }
  });
  guardButton.addEventListener('keyup', () => {
    guard = false;
  });
  guardButton.addEventListener('blur', () => {
    guard = false;
    if (action === 'parry') action = null;
  });
  function moveStick(event: PointerEvent) {
    const rect = joystick.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) / 42;
    const z = (event.clientY - rect.top - rect.height / 2) / 42;
    const length = Math.hypot(x, z),
      scale = Math.max(1, length);
    moveX = length < 0.12 ? 0 : x / scale;
    moveZ = length < 0.12 ? 0 : z / scale;
    // Sprint is a deliberate push well past the knob's rim (the rim is length 1; 1.4 is ~17 px beyond it), and the knob shows it.
    stickRun = (env.innerWidth() <= 900 || env.matchMedia('(pointer:coarse)').matches) && length > SPRINT_PUSH;
    stick.style.transform = `translate(${moveX * 34}px, ${moveZ * 34}px)`;
    stick.dataset.run = String(stickRun);
  }
  // The stick must never stay pushed after the thumb has gone: a new touch always takes it over, and its release is honoured wherever the
  // browser delivers it (a pointerup that lands outside the pad when capture was lost, or a touchend with no fingers left on the screen).
  function releaseStick() {
    moveId = null;
    stickRun = false;
    moveX = moveZ = 0;
    stick.style.transform = '';
    stick.dataset.run = 'false';
  }
  joystick.addEventListener('pointerdown', (event) => {
    if (paused()) return;
    moveId = event.pointerId;
    try {
      joystick.setPointerCapture(moveId);
    } catch {
      /* the pad still follows this pointer through the window listeners */
    }
    moveStick(event);
  });
  joystick.addEventListener('pointermove', (event) => {
    if (event.pointerId === moveId) moveStick(event);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    joystick.addEventListener(name, (event) => {
      if ((event as PointerEvent).pointerId === moveId) releaseStick();
    });
  for (const name of ['pointerup', 'pointercancel'])
    env.window.addEventListener(name, (event) => {
      if ((event as PointerEvent).pointerId === moveId) releaseStick();
    });
  env.window.addEventListener('touchend', (event) => {
    if (moveId !== null && event.touches.length === 0) releaseStick();
  });
  env.window.addEventListener('touchcancel', (event) => {
    if (moveId !== null && event.touches.length === 0) releaseStick();
  });
  return {
    // Frame start: a held Step that has outlived HOLD_MS grows into the roll.
    promoteDodge(now: number) {
      if (dodgeHeld && !dodgeHeld.rolled && now - dodgeHeld.since >= HOLD_MS) {
        dodgeHeld.rolled = true;
        request('dodge');
      }
    },
    // What the simulation sees this tick. Presses reach it only once the assets are ready (the buttons read disabled until then).
    intent(): ControlIntent {
      if (slashWait && env.now() - slashWait.since >= SLASH_DECIDE_MS) fireSlash(null);
      const ready = env.ready(), q = keys.has('KeyQ'), arrow = (code: string) => !q && keys.has(code);
      // The side the simulation will see this tick: the thumb's slide, else Q + an arrow. The button's hint (data-side) follows it, so a
      // keyboard guard lights the arrow's side too and shows straight again on release.
      const guardDirection = guardDir ?? (q ? (Object.keys(ARROW_SIDE).filter((k) => keys.has(k)).map((k) => ARROW_SIDE[k])[0] ?? null) : null);
      const sideLabel = guardDirection ?? 'straight';
      if (guardId === null && guardButton.dataset.side !== sideLabel) guardButton.dataset.side = sideLabel;   // write only on change: no style invalidation 60× a second
      const x = lateral(), cut = cutAction(cutLateral()), cutSide = cutSideOf(cut);
      if ((attackButton.dataset.cut ?? null) !== cutSide) { if (cutSide) attackButton.dataset.cut = cutSide; else delete attackButton.dataset.cut; }   // the button lights the side the next LIGHT will cut (style.css)
      return {
        x,
        z:
          moveZ +
          Number(keys.has('KeyS') || arrow('ArrowDown')) -
          Number(keys.has('KeyW') || arrow('ArrowUp')),
        run: run || stickRun || keys.has('ShiftLeft') || keys.has('ShiftRight'),
        action: ready ? action : null,
        guard: ready && (guard || dragGuard || q),
        guardDirection,
        held: ready && held(),
        cancel,
      };
    },
    // After the tick: track what the simulation's buffer can still hold — a request we sent this tick, until something of ours starts
    // (or a cancel) — and clear the one-shot press and cancel.
    consumed(events: CombatEvent[]) {
      if (
        cancel ||
        events.some((e) => e.actor === 0 && (e.type === 'AttackStarted' || e.type === 'ActionStarted'))
      )
        sent = null;
      if (action) sent = action;
      action = null;
      cancel = false;
    },
    // Every press, hold, key and stick released: the welcome/journal/rename/visibility paths, a rematch, a graphics loss.
    clear() {
      action = null;
      cancel = true;
      dodgeHeld = null;
      holders.clear();
      slashWait = null; delete attackButton.dataset.slide;
      dragGuard = false;
      env.quiet();
      keys.clear();
      guard = false;
      guardId = null;
      guardFrom = null;
      guardDir = null; showSide();
      run = stickRun = false;
      moveX = moveZ = 0;
      moveId = null;
      stick.style.transform = '';
      stick.dataset.run = 'false';
      runButton.setAttribute('aria-pressed', 'false');
    },
  };
}
export type Controls = ReturnType<typeof createInput>;   // was `Input`, which sim.ts already uses for the movement input
