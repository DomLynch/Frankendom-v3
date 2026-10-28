// The input layer: keyboard, the strike/kick/dodge/guard buttons (the thumb cluster), the sprint button and the
// joystick, folded into one intent per tick for the simulation. At most one edge-triggered action per tick plus the held guard level;
// the simulation owns legality and buffering. Everything the layer touches is injected — the DOM lookup, window, clock, media
// query, viewport width — so the entry point's own globals (and the VM harness's fakes in tests/graphics.test.ts) are what it binds to.
import { accepts, type Action, type CombatEvent, type Practice } from './combat.ts';
import type { Direction } from './moves.ts';
import { inputNum } from './input-rows.ts';
import { SPELL_BUFFER_MS } from './sandbox-rules.ts';
import { isFreeAction } from './free-roam.ts';
import { applyTouchLayout } from './touch-layout.ts';
import { attachTapLog, tapLogOn } from './tap-log.ts';
import { buttonOf, keyAlias, type KbmRows } from './kbm.ts';

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
  // Keyboard + mouse (data/input.json, src/fight/kbm.ts). Absent or null (`?input=v1`, and every test that builds the layer bare) = the controls exactly as they were: no mouse, no new key, no key map.
  kbm?: KbmRows | null;
  walking?: () => boolean;   // the hero stands after a kill (free-roam.ts): ROLL, STEP and GUARD presses go to the page's walking hero though the finished fight takes none
  free?: () => boolean;      // the camera is free (nobody locks it): a left-drag looks round instead of picking a swing
  overPart?: (x: number, y: number) => boolean;   // an optional hook: a point that is not a strike (nothing passes one now: #219's Take is gone, a click on a corpse part strikes and the corpse tap cuts it)
};
// The controls' intent for one frame, named apart from the simulation's `Intent` (duel.ts) it is folded into by main.ts: the two
// shapes differ (stick axes here, a camera-relative move plus lock there) and sharing a name at that seam misled the audit twice.
export type ControlIntent = { x: number; z: number; run: boolean; action: Action | null; guard: boolean; guardDirection: Direction | null; held: boolean; cancel: boolean };
// Guard side (owner 2026-09-20, five sides): the thumb still on the Guard button is the straight guard (null: the simulation reads it as the
// stab's side); slid past GUARD_SLIDE_PX it is that side — left, right, up = overhead, down = low. Keyboard: Q held + an arrow key.
// Hysteresis (brief 7, 2026-09-21): the sectors meet on the diagonals, and a thumb wobbling near one flipped the side every frame. A side
// already held keeps its axis until the thumb is GUARD_DEAD_BAND_DEG past the diagonal into the next sector; a fresh slide (no side
// held) picks the dominant axis as before. Intent only — nothing about parry timing, block cost or the exposure changes.
export const GUARD_SLIDE_PX = inputNum('input.guard-slide-px'), GUARD_DEAD_BAND_DEG = inputNum('input.guard-dead-band-deg');
export const guardSide = (dx: number, dy: number, held: Direction | null = null): Direction | null => {
  if (!(Math.hypot(dx, dy) >= GUARD_SLIDE_PX)) return null;
  const fromHorizontal = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;   // 0 = along the horizontal axis, 90 = along the vertical
  const horizontal = held === 'left' || held === 'right' ? fromHorizontal < 45 + GUARD_DEAD_BAND_DEG : held === 'overhead' || held === 'low' ? fromHorizontal < 45 - GUARD_DEAD_BAND_DEG : Math.abs(dx) > Math.abs(dy);
  return horizontal ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'overhead' : 'low';
};
// Directional cuts (Dom GO 2026-10-07; the strike circle's flick did this until 226456f9 retired it, and the sim never stopped taking both): LIGHT pressed while the
// move stick, A/D or the arrows are held to a side cuts to that side; held neutral keeps the alternating light. Intent only: the sim already accepts light_left and light_right.
export const CUT_PUSH = inputNum('input.cut-push');   // the stick's own dead zone is 0.12; a side cut wants a deliberate push, not a wobble
export const cutAction = (lateral: number): Action => (lateral <= -CUT_PUSH ? 'light_left' : lateral >= CUT_PUSH ? 'light_right' : 'light');
// Slash's cut side is the thumb's slide on the SLASH button (Dom 2026-10-07: "slide left, see the gold arc, and then I will slash left"). The swing waits for the thumb:
// it fires on a slide of SLASH_SLIDE_PX (that side, at once), on release, or after SLASH_DECIDE_MS (the alternating light), whichever comes first. A plain tap
// therefore gets up to SLASH_DECIDE_MS later; change the one constant to trade it. Intent only: the sim already takes light_left / light_right.
export const SLASH_SLIDE_PX = inputNum('input.slash-slide-px'), SLASH_DECIDE_MS = inputNum('input.slash-decide-ms');
// oneButton (Combat sandbox CS31, touch layout A; off by default, `?onebutton=1` turns it on for a look): the STRIKE button decides its swing by the thumb. A release before HEAVY_HOLD_MS is the plain light, a slide of STAB_SLIDE_PX
// straight up (within STAB_HALF_ANGLE degrees) is the thrust, a slide to a side is that cut, a hold past HEAVY_HOLD_MS is the heavy. Intent only: the fight already takes every one of those actions. Off = today's Light button.
const ONE_BUTTON_QUERY = /[?&;]onebutton=1\b/.test(typeof location === 'undefined' ? '' : location.search);
export const ONE_BUTTON = Boolean(inputNum('input.one-button')) || ONE_BUTTON_QUERY;
const RAD = Math.PI / 180;   // degrees to radians
// CS36b: inside a guard-counter / punish window (20 ticks after a block, duel.ts) a hold decides the heavy after HEAVY_HOLD_WINDOW_MS instead: at HEAVY_HOLD_MS (220) the reaction to a block plus the hold ran past the window, so the heavy riposte was unreachable under layout A.
export const HEAVY_HOLD_MS = inputNum('input.heavy-hold-ms'), HEAVY_HOLD_WINDOW_MS = inputNum('input.heavy-hold-window-ms'), STAB_SLIDE_PX = inputNum('input.stab-slide-px'), STAB_HALF_ANGLE = inputNum('input.stab-half-angle');
// A slide within STAB_HALF_ANGLE degrees of straight up is the stab. Screen y grows down, so up is dy < 0.
/** How long a hold on STRIKE must last to be the heavy: the short window hold while the hero's counter / punish window is open, else the plain one. */
export const heavyHoldMs = (counterOpen: boolean): number => (counterOpen ? HEAVY_HOLD_WINDOW_MS : HEAVY_HOLD_MS);
export const stabSector = (dx: number, dy: number): boolean => dy < 0 && Math.abs(dx) <= -dy * Math.tan(STAB_HALF_ANGLE * RAD);
// V3 directional heavies (V2 PR #60, Dom 2026-10-26: "the heavy should follow the swipe like the other attacks"). oneButton: a hold on STRIKE arms the heavy at
// heavyHoldMs() as before; outside a counter / punish window it then waits HEAVY_GRACE_MS for the thumb: a slide of STAB_SLIDE_PX up (the stab sector) is the heavy
// stab, to a side that side's heavy cut; no slide (or a release) is V1's overhead heavy. Inside a window nothing changes (the heavy fires at the short hold, no wait).
// The slide is measured from where the thumb is when the heavy arms, not from the press: drift during the hold does not pick a side.
// Keyboard: G with A/D (or the arrows) held is that side's heavy cut (as F's cut), else V1's heavy; W is walking, so no key gives the heavy stab. `?heavy=v1` (or the row at 0) turns all of
// it off: today's input exactly. Intent only: duel.ts chooseMove turns the press into the move (move-defs.json `directional`).
const HEAVY_V1_QUERY = /[?&;]heavy=v1\b/.test(typeof location === 'undefined' ? '' : location.search);
export const DIRECTIONAL_HEAVY = Boolean(inputNum('input.directional-heavy')) && !HEAVY_V1_QUERY, HEAVY_GRACE_MS = inputNum('input.heavy-grace-ms');
/** The directional heavy a slide of (dx, dy) from the press picks: the stab sector is the heavy stab, otherwise the side of dx (as a light's slide). */
export const heavySlide = (dx: number, dy: number): Action => (stabSector(dx, dy) ? 'heavy_thrust' : dx < 0 ? 'heavy_left' : 'heavy_right');
export const slashSlide = (dx: number): 'left' | 'right' | null => (dx <= -SLASH_SLIDE_PX ? 'left' : dx >= SLASH_SLIDE_PX ? 'right' : null);
export const cutSideOf = (action: Action): 'left' | 'right' | null => (action === 'light_left' ? 'left' : action === 'light_right' ? 'right' : null);   // the side a cut press goes to; neutral LIGHT is null (no flash)
const ARROW_SIDE: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'overhead', ArrowDown: 'low' };

// Dodge control: the press is an instant backstep; holding it past HOLD_MS grows the step into a roll. Swipe-down rolls directly.
export const HOLD_MS = inputNum('input.hold-ms'),
  SPRINT_PUSH = inputNum('input.sprint-push');
// Strike controls: the press swings at once; keeping it held charges (Heavy), loads (Stab) or chambers (Slash) the swing — the simulation owns
// the timing. The held level belongs to the control that raised it: releasing one never drops another's. Dragging a held strike off its
// circle turns the press into a guard press (a feint inside the wind-up's feint window, a parry or a raised guard after it) until it lifts.
type Strike = 'light' | 'heavy' | 'thrust';
const ownerOf = (move: string | null): Strike | null =>
  move === 'heavy_overhead' || move === 'heavy_right' || move === 'heavy_left' || move === 'heavy_thrust'   // + V3's directional heavies: held by the heavy's hold, so they chamber and charge as the overhead does
    ? 'heavy'
    : move === 'thrust'
      ? 'thrust'
      : move?.startsWith('light_')
        ? 'light'
        : null;
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];

export function createInput(env: InputEnv) {
  const { element, paused } = env;
  const KBM = env.kbm ?? null, alias = KBM ? keyAlias(KBM) : null;
  let lockToggles = 0;   // Tab presses since the page last asked (takeLockToggle)
  const attackButton = element<HTMLButtonElement>('attack-button');
  const kickButton = element<HTMLButtonElement>('kick-button');
  const heavyButton = element<HTMLButtonElement>('heavy-button');
  const skillButton = element<HTMLButtonElement>('skill-button'), skill2Button = element<HTMLButtonElement>('skill2-button');
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
  let slashWait: { since: number; x: number; y: number; lx: number; ly: number; armed?: number } | null = null;   // a SLASH press still deciding its side (see slashSlide); x/y: where the slide is measured from; lx/ly: the thumb's last place; armed: when its hold armed the directional heavy (DIRECTIONAL_HEAVY), which now waits for a slide
  const holders = new Set<Strike>();
  let dragGuard = false;
  // The held level the simulation sees: during a swing, whether the control that threw it is still down; otherwise whether any strike control is.
  const held = () => {
    const f = env.practice().duel.fighters[0],
      owner = f.phase === 'attack' ? ownerOf(f.move) : null;
    return owner ? holders.has(owner) : holders.size > 0;
  };
  // The hero's guard-counter (a block) or punish (a parry) window is open: the next heavy is the riposte / counter, so its hold is the short one (CS36b).
  const counterOpen = (): boolean => { const f = env.practice().duel.fighters[0]; return f.counterWindow > 0 || f.punish > 0; };
  function hold(by: Strike) {
    holders.add(by);
  }
  function unhold(by: Strike) {
    holders.delete(by);
  }
  // sandbox spellBuffer: a SPELL press the game cannot take yet (staggered, mid-recovery) waits SPELL_BUFFER_MS and fires the moment it can, so a tap is never silently lost. 0 (trunk) = off.
  let pendingSpell: { action: Action; until: number } | null = null;
  function request(next: Action) {
    if (!paused() && env.ready()) env.press?.();
    if (!paused() && env.ready() && (accepts(env.practice(), next) || (!!env.walking?.() && isFreeAction(next)))) { action = next; pendingSpell = null; }
    else if (SPELL_BUFFER_MS && (next === 'skill' || next === 'skill2') && !paused() && env.ready()) pendingSpell = { action: next, until: env.now() + SPELL_BUFFER_MS };
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
  function requestSkill2() {   // slot b (spell-slot-defs.json): legal() refuses it with an empty slot, while it cools or below its stamina
    request('skill2');
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
  // V3: the heavy the G key throws (DIRECTIONAL_HEAVY): A/D or the arrows held = that side's heavy cut (the light's own cutLateral), else V1's heavy (G while walking forward stays the overhead).
  const keyHeavy = (): Action => { const side = cutAction(cutLateral()); return side === 'light_left' ? 'heavy_left' : side === 'light_right' ? 'heavy_right' : 'heavy'; };
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
  function fireSlash(side: 'left' | 'right' | null, byMouse = false) {
    slashWait = null;
    if (side) { attackButton.dataset.slide = side; take(side === 'left' ? 'light_left' : 'light_right'); }
    else if (byMouse && KBM?.strike.forwardStab && (keys.has('KeyW') || keys.has('ArrowUp')) && !keys.has('KeyQ') && !cutLateral()) fireStab();   // a click with W held (and no side key) is the stab
    else requestStrike();
  }
  function fireStab() { slashWait = null; hold('thrust'); request('thrust'); }   // oneButton: a slide up from STRIKE
  function fireHeavy(next: Action = 'heavy') { slashWait = null; hold('heavy'); take(next); }   // oneButton: a hold on STRIKE ('heavy' = V1's; a directional heavy after a slide)
  // Every strike press goes through here: when it is TAKEN, a brief edge flash on the cut side (a thumb slide fires through fireSlash, keys and sticks through requestStrike).
  function take(next: Action) {
    request(next);
    if (action === next) flashCut(next);
  }
  function requestStrike(isHeavy = false) {
    take(isHeavy ? 'heavy' : cutAction(cutLateral()));   // the press goes through take(): flashed only when taken
  }
  // The key map (data/input.json keys): with the rows on, a code is read as its action's canonical code (Space is the roll's E, Z the first special's 1...); a code in no row does nothing. Off: the code as it is.
  const codeOf = (event: KeyboardEvent): string | null => (alias ? alias.get(event.code) ?? null : event.code);
  env.window.addEventListener('keydown', (event) => {
    if (paused() || (event.target as { tagName?: string } | null)?.tagName === 'INPUT') return; // typing a name is not fighting
    const code = codeOf(event);
    if (code === null) return;
    if (KBM && (event.metaKey || event.ctrlKey || event.altKey)) return;   // a browser shortcut (Ctrl+R, Cmd+Q...) is not a fight key
    if (KBM && event.code === 'Space' && (event.target as { tagName?: string } | null)?.tagName === 'BUTTON') return;   // Space on a focused button presses that button (its own handler)
    if ([...MOVE_KEYS, 'ShiftLeft', 'ShiftRight'].includes(code)) {
      event.preventDefault();
      keys.add(code);
    }
    if (code === 'KeyF' && !event.repeat) {
      event.preventDefault();
      requestStrike();
    }
    if (code === 'KeyC' && !event.repeat) {
      event.preventDefault();
      requestKick();
    }
    if (code === 'KeyG' && !event.repeat) {
      event.preventDefault();
      hold('heavy');
      take(DIRECTIONAL_HEAVY && !counterOpen() ? keyHeavy() : 'heavy');   // V3: G + A/D/W picks a directional heavy; ?heavy=v1 = requestStrike(true), V1's
    }
    if (code === 'KeyT' && !event.repeat) {
      event.preventDefault();
      hold('thrust');
      request('thrust');
    }
    if (code === 'KeyE' && !event.repeat) {
      event.preventDefault();
      pressDodge(env.now());
    }
    if (code === 'KeyQ') {
      event.preventDefault();
      keys.add(code);
      if (!event.repeat) requestParry();
    }
    if (code === 'KeyR' && !event.repeat) element('recenter-button').click();
    if (KBM && !event.repeat) {   // the keys V1's keyboard never had: the two specials, the lock, Esc
      if (code === 'Digit1') { event.preventDefault(); requestSkill(); }
      if (code === 'Digit2') { event.preventDefault(); requestSkill2(); }
      if (code === 'Tab') { event.preventDefault(); lockToggles++; }
      if (code === 'Escape') clearAll();   // lets go of everything held (keys, the mouse press, a guard); the browser's own Esc (full screen) is not stopped
    }
  });
  env.window.addEventListener('keyup', (event) => {
    const code = codeOf(event);
    if (code === null) return;
    keys.delete(code);
    if (code === 'KeyE') releaseDodge();
    if (code === 'KeyG') unhold('heavy');
    if (code === 'KeyT') unhold('thrust');
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
      if (deferred) slashWait = { since: env.now(), x: event.clientX, y: event.clientY, lx: event.clientX, ly: event.clientY };
      else start();
    });
    button.addEventListener('pointermove', (event) => {
      if (event.pointerId !== id || dragged) return;
      if (deferred && slashWait) { slashWait.lx = event.clientX; slashWait.ly = event.clientY; const side = slashSlide(event.clientX - slashWait.x); if (ONE_BUTTON) { const dx = event.clientX - slashWait.x, dy = event.clientY - slashWait.y; if (Math.hypot(dx, dy) >= STAB_SLIDE_PX) { if (slashWait.armed !== undefined) fireHeavy(heavySlide(dx, dy)); else if (stabSector(dx, dy)) fireStab(); else fireSlash(dx < 0 ? 'left' : 'right'); return; } } else if (side) { fireSlash(side); return; } }
      if (ONE_BUTTON && deferred && !slashWait) return;   // oneButton: the swipe has decided (stab, cut or heavy); sliding on out of the circle is not a guard press that overrides it
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
        if (deferred && slashWait) { if (type === 'pointerup' && !dragged) { if (slashWait.armed !== undefined) fireHeavy(); else fireSlash(null); } else slashWait = null; }   // a release decides the plain light (V3: inside the directional heavy's grace, V1's heavy)
        unhold(name);
        if (ONE_BUTTON && deferred) { unhold('heavy'); unhold('thrust'); }   // oneButton: the swing the swipe chose is released with the thumb
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
  if (typeof document !== 'undefined' && tapLogOn(location.search)) attachTapLog(document, attackButton);   // `?taplog=1` only: a local STRIKE press-length meter (tap-log.ts); off by default, nothing leaves the page
  if (ONE_BUTTON && typeof document !== 'undefined') applyTouchLayout(document, location.search);   // touch layout A goes with the one-button strike (touch-layout.ts); off by default
  skillButton.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      event.preventDefault();
      requestSkill();
    }
  });
  skill2Button.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      event.preventDefault();
      requestSkill2();
    }
  });
  skill2Button.addEventListener('pointercancel', () => withdraw('skill2'));
  skill2Button.addEventListener('keydown', (event) => {
    if (['Space', 'Enter'].includes(event.code) && !event.repeat) {
      event.preventDefault();
      requestSkill2();
    }
  });
  skillButton.addEventListener('pointercancel', () => withdraw('skill'));
  skillButton.addEventListener('keydown', (event) => {
    if (['Space', 'Enter'].includes(event.code) && !event.repeat) {
      event.preventDefault();
      requestSkill();
    }
  });
  // sandbox-mech spell slot 2: the sandbox's SPELL 2 button (#sbx-spell2, built by sandbox/entry.ts after the page boots) presses the second spell; delegated so the button may appear any time, and absent on every other build.
  skillButton.ownerDocument?.addEventListener?.('pointerdown', (event) => {
    if ((event as PointerEvent).button === 0 && (event.target as HTMLElement | null)?.closest?.('#sbx-spell2')) { event.preventDefault(); request('skill2'); }
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
  // The mouse (data/input.json mouse, strike): the arena canvas is the STRIKE and GUARD buttons for a mouse pointer. Left = STRIKE with the thumb's own rules (a click is the light, a hold the heavy, a flick the
  // stab or a slash; A/D/W held pick the same before it); right held = GUARD, the cursor's slide from the press the side. Touch and pen never reach this (pointerType), and ?input=v1 never builds it.
  let mouseId: number | null = null, mouseGuardId: number | null = null;
  if (KBM) {
    const canvas = element<HTMLCanvasElement>('world');
    const capture = (id: number) => { try { canvas.setPointerCapture(id); } catch { /* capture is a convenience */ } };
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || paused() || !env.ready()) return;
      if (event.button === buttonOf(KBM, KBM.mouse.guard)) {
        if (guardId !== null || mouseGuardId !== null) return;
        event.preventDefault();
        mouseGuardId = event.pointerId; capture(mouseGuardId);
        guardFrom = { x: event.clientX, y: event.clientY };
        guardDir = null; showSide();
        guard = true;
        requestParry();
      } else if (event.button === buttonOf(KBM, KBM.mouse.strike)) {
        if (mouseId !== null || env.overPart?.(event.clientX, event.clientY)) return;   // a click on a cut part to take is the pickup's
        event.preventDefault();
        mouseId = event.pointerId; capture(mouseId);
        hold('light');
        attackButton.dataset.held = '';
        slashWait = { since: env.now(), x: event.clientX, y: event.clientY, lx: event.clientX, ly: event.clientY };
      }
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      if (event.pointerId === mouseGuardId && guardFrom) {
        const side = guardSide(event.clientX - guardFrom.x, event.clientY - guardFrom.y, guardDir);
        if (side !== guardDir) { guardDir = side; showSide(); }
        return;
      }
      if (event.pointerId !== mouseId || !slashWait) return;
      slashWait.lx = event.clientX; slashWait.ly = event.clientY;
      const dx = event.clientX - slashWait.x, dy = event.clientY - slashWait.y, moved = Math.hypot(dx, dy);
      if (env.free?.()) {   // the camera is free: the drag looks round (main.ts), it is not a swing; a click that stays put is still a strike
        if (moved >= KBM.mouse.lookDragPx) { slashWait = null; mouseId = null; unhold('light'); delete attackButton.dataset.held; }
        return;
      }
      if (moved < KBM.strike.slidePx) return;
      if (slashWait.armed !== undefined) fireHeavy(heavySlide(dx, dy)); else if (stabSector(dx, dy)) fireStab(); else fireSlash(dx < 0 ? 'left' : 'right');
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      canvas.addEventListener(type, (event) => {
        const e = event as PointerEvent;
        if (e.pointerType !== 'mouse') return;
        if (e.pointerId === mouseGuardId) {
          mouseGuardId = null; guardFrom = null; guardDir = null; showSide(); guard = false;
          if (type === 'pointercancel') withdraw('parry');
        }
        if (e.pointerId !== mouseId) return;
        mouseId = null;
        if (slashWait) { if (type === 'pointerup') { if (slashWait.armed !== undefined) fireHeavy(); else fireSlash(null, true); } else slashWait = null; }
        unhold('light'); unhold('heavy'); unhold('thrust');
        delete attackButton.dataset.held; delete attackButton.dataset.slide;
        if (type === 'pointercancel') withdraw('light');
      });
  }
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
      if (slashWait && slashWait.armed === undefined && env.now() - slashWait.since >= (ONE_BUTTON ? heavyHoldMs(counterOpen()) : SLASH_DECIDE_MS)) {   // oneButton: a hold past heavyHoldMs() (HEAVY_HOLD_MS, or HEAVY_HOLD_WINDOW_MS inside a counter window) is the heavy
        if (!ONE_BUTTON) fireSlash(null);
        else if (DIRECTIONAL_HEAVY && !counterOpen()) { slashWait.armed = env.now(); slashWait.x = slashWait.lx; slashWait.y = slashWait.ly; }   // V3: armed; the slide (pointermove, from here) or the grace below decides which heavy
        else fireHeavy();
      }
      if (slashWait && slashWait.armed !== undefined && (counterOpen() || env.now() - slashWait.armed >= HEAVY_GRACE_MS)) fireHeavy();   // V3: no slide inside the grace (or a window opened): V1's overhead heavy
      if (pendingSpell) { if (env.now() > pendingSpell.until) pendingSpell = null; else if (!action && env.ready() && accepts(env.practice(), pendingSpell.action)) { action = pendingSpell.action; pendingSpell = null; } }
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
    /** Tab was pressed since the last ask (kbm only): the page toggles the soft lock (lock-break.ts toggleLock). Read once per tick. */
    takeLockToggle(): boolean { const t = lockToggles > 0; lockToggles = 0; return t; },
    // Every press, hold, key and stick released: the welcome/journal/rename/visibility paths, a rematch, a graphics loss.
    clear: clearAll,
  };
  function clearAll() {
      lockToggles = 0; mouseId = null; mouseGuardId = null;
      action = null; pendingSpell = null;
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
  }
}
export type Controls = ReturnType<typeof createInput>;   // was `Input`, which sim.ts already uses for the movement input
