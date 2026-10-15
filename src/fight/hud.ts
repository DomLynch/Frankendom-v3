// The combat HUD: meters, labels, the combat buttons' enabled/hidden/label state, and the floating damage numbers. Pure DOM
// binding over the practice state — it never decides anything about the fight. `element` is injected so the entry point's
// own lookup (and the VM test harness's fake document) is what it binds to.
import { accepts, counterLine, practiceHint, type ClarityEvent, type CombatEvent, type Practice } from './combat.ts';
import { defenceGrade, GRADE_LABEL } from './defence-grade.ts';
import { won } from '../ladder.ts';
import { SPELL_OF_LEGEND } from './spell-legends.ts';
import { bareName } from '../roster.ts';
import { LESSON_FELL, LESSON_NEXT, lessonText, type LessonLine } from '../lessons.ts';
import { createGapHistory } from './kick-close.ts';
import { staminaLow } from './fatigue-preview.ts';
import { SKILL_MOVE, weaponOf, type OpponentId } from './moves.ts';
import { fxNum } from './fx-rows.ts';

// Heavy-class contacts: bigger damage numbers here, a longer hit-stop in the frame loop.
export const HEAVY_MOVES = new Set<string>(['heavy_overhead', 'heavy_riposte', 'heavy_counter', 'critical']);
// Lit = a kick pressed from here lands on a guard-raised foe. Measured 2026-10-07 (tests/hud.test.ts): the true far edge is 1.585 m (the 1.2 m cone plus the kick's .55 stride), so 1.5 keeps a margin for the foe's step.
export const KICK_LANDS = fxNum('hud.kick-light-m');   // a HUD margin under the true edge (tests/hud.test.ts ties it to the live sim: 0 <= edge - this <= 0.15)

export type HudView = { slotB?: boolean; slotBSpell?: string; legend?: string; controlsReady: boolean; debug: boolean; opponentId: OpponentId; next?: { name: string }; replay?: boolean; practiceOnly?: boolean; stalled?: boolean; dummy?: boolean; lesson?: LessonLine; lessonFight?: boolean; headline?: string | null; kickClose?: boolean; fatiguePreview?: boolean; staminaShown?: number };   // dummy: a sparring fight against the no-attack dummy   // replay: watching a record (PLAY NOW after); practiceOnly: that fight, no ladder step; stalled: the viewer page cannot go on
// The one bar drawing: a meter's max, its value and the --fill custom property the style sheets draw it from (a <meter>'s own pseudo bars differ per engine).
export function fillMeter(meter: HTMLElement, value: number, max: number) { meter.style.setProperty('--fill', `${Math.max(0, value / max) * 100}%`); }   // never below 0 (a dead foe's bar at -2 hp, the zone bars' old clamp)
export function paintMeter(meter: HTMLMeterElement, value: number, max: number) { meter.max = max; meter.value = value; fillMeter(meter, value, max); }

// The bars a zone shows over the walk are the Pit's own (Dom 2026-10-14, "the original ones look better"): the same .combat-hud markup and src/style.css, painted from plain numbers because the open-world loop has no
// Practice. The foe's name over its bar, then HEALTH and STAMINA, are the Pit's #opponent-name / #target-health / #player-health / #stamina, drawn through the same fillMeter / paintMeter createHud uses; the page builds
// nothing of its own (tests/fight-no-twins.test.ts). `shown` toggles body.zone-bars (origins/preview/index.html shows the Pit's .combat-hud only then); the hit vignette is the one element this adds.
export type MeterState = { hp: number; maxHp: number; stamina: number; maxStamina: number; foe: { name: string; level?: number; hp: number; max: number } | null };
type Lookup = <T extends HTMLElement>(id: string) => T;
export function createZoneBars(element: Lookup, parent: HTMLElement) {
  const flashEl = parent.ownerDocument.createElement('div'); flashEl.className = 'fm-flash'; parent.append(flashEl);
  const name = element('opponent-name'), foe = element<HTMLMeterElement>('target-health'), hp = element<HTMLMeterElement>('player-health'), stamina = element<HTMLMeterElement>('stamina');
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  return {
    /** Paint the Pit's bars; `shown` false hides them (the zone hides them while the hero is whole and nothing is in reach). */
    update(state: MeterState, shown: boolean) {
      parent.classList.toggle('zone-bars', shown); if (!shown) return;
      paintMeter(hp, state.hp, state.maxHp); paintMeter(stamina, state.stamina, state.maxStamina);
      element('player-health-value').textContent = `${Math.round(state.hp)} / ${state.maxHp}`; element('stamina-value').textContent = `${Math.round(state.stamina)} / ${state.maxStamina}`;
      name.replaceChildren(state.foe ? state.foe.name.toUpperCase() : ''); name.dataset.mobile = state.foe ? state.foe.name : '';
      if (state.foe?.level !== undefined) { const small = name.ownerDocument.createElement('small'); small.className = 'opponent-class'; small.textContent = `Lv ${state.foe.level}`; name.append(' ', small); }   // the Pit's own level slot (origins/preview/pit-duel.ts nameOpponent): the name large, the level small beside it   // the phone draws data-mobile (src/style.css .meter-label::after)
      if (state.foe) paintMeter(foe, state.foe.hp, state.foe.max); else paintMeter(foe, 0, 1);
      element('health-value').textContent = state.foe ? `${Math.round(state.foe.hp)} / ${state.foe.max}` : '';
    },
    /** Paint from the open-world loop itself (hero, the foe in reach, whether a fight is on); hidden while the hero is whole and nothing is in reach. */
    feed(wc: { hero(): { health: number; max: number; stamina: number; maxStamina: number }; target(): { name: string; level?: number; health: number; max: number } | null; inCombat(): boolean }) {
      const h = wc.hero(), t = wc.target(), full = h.health >= h.max - 0.5 && h.stamina >= h.maxStamina - 0.5;
      this.update({ hp: h.health, maxHp: h.max, stamina: h.stamina, maxStamina: h.maxStamina, foe: t ? { name: t.name, level: t.level, hp: t.health, max: t.max } : null }, !(full && !t && !wc.inCombat()));
    },
    /** The hero was hit: a red vignette for a moment. */
    flash() { flashEl.dataset.on = 'true'; clearTimeout(flashTimer); flashTimer = setTimeout(() => { flashEl.dataset.on = 'false'; }, 120); },
  };
}

export function createHud(element: Lookup) {
  const attackButton = element<HTMLButtonElement>('attack-button');
  const kickButton = element<HTMLButtonElement>('kick-button');
  const heavyButton = element<HTMLButtonElement>('heavy-button');
  const skillButton = element<HTMLButtonElement>('skill-button'), skill2Button = element<HTMLButtonElement>('skill2-button'), SPELL2_LABEL = skill2Button.dataset.mobile ?? '';   // the generic words are the page's own markup (index.html), read once
  const dodgeButton = element<HTMLButtonElement>('dodge-button');
  const guardButton = element<HTMLButtonElement>('guard-button');
  const thrustButton = element<HTMLButtonElement>('thrust-button');
  const resetButton = element<HTMLButtonElement>('reset-button');
  const playerHealth = element<HTMLMeterElement>('player-health');
  const stamina = element<HTMLMeterElement>('stamina');
  const health = element<HTMLMeterElement>('target-health');
  const combatStatus = element('combat-status');
  let defendedTimer: ReturnType<typeof setTimeout> | undefined;
  // Damage numbers (owner mockup, 2026-09-19): a clean hit floats its damage off the victim — white for dealt, warm red for taken, gold and
  // bigger for the heavy-class ones (charged, counter, riposte, critical). Four pooled spans round-robin (a duel never shows four at once);
  // positions come from the scene's world→screen projection. Presentation-only.
  const dmgPool = Array.from(element('dmg-pool').children) as HTMLElement[];
  let dmgCursor = 0;
  let lastHud = '';
  let staminaLowOn = false;   // ?look=fatigue-preview's low-stamina state (hysteresis needs the previous one)
  const gaps = createGapHistory();   // ?look=kickclose (kick-close.ts): the last few ticks of the gap
  return {
    // Force the next update to write everything (the debug toggle relabels the buttons).
    invalidate() {
      lastHud = '';
    },
    update(practice: Practice, view: HudView) {
      // The sparring dummy never attacks (src/sparring.ts), so the sheathed line's "will counterattack" is false there (Strategy 2026-09-26).
      const foe = bareName(view.opponentId), line = view.headline ? practiceHint(practice, foe, view.legend).replace(' Ready for a rematch?', ` ${view.headline} Ready for a rematch?`) : practiceHint(practice, foe, view.legend),   // ?look=headline (victory-headline.ts): the earned line sits before the rematch prompt of a win
        hint = view.lesson ? lessonText(view.lesson) : view.lessonFight && !practice.playerHealth ? LESSON_FELL : view.dummy ? line.replace(counterLine(foe, view.legend), 'The dummy never attacks.') : line,   // lesson: a teaching beat the fight set (lessons.ts) wins the line while it is up
        controlsReady = view.controlsReady;
      const ok = (['light', 'heavy', 'kick', 'backstep', 'parry'] as const).map(
        (a) => accepts(practice, a) || (a === 'backstep' && accepts(practice, 'dodge')),
      );
      // accepts() is true for every action in a committed action's buffer window, so SKILL refuses its own cooldown here (live c1bda34d).
      const skillOk = practice.duel.fighters[0].skillCooldown === 0 && (practice.duel.fighters[0].skill !== null || practice.duel.fighters[0].spell !== undefined) && accepts(practice, 'skill');   // an equipped spell is cast through the same slot, with or without a skill (spell-pick.ts)
      const gap = Math.hypot(practice.enemy.x - practice.fighter.x, practice.enemy.z - practice.fighter.z);
      gaps.record(practice.duel.tick, gap, practice.duel.fighters[0].phase === 'hurt');   // every update, before the dedup below: the history must not skip a quiet frame
      const inKickReach = gap <= KICK_LANDS && !(view.kickClose && gaps.retreating(practice.duel.tick, gap));   // flag off: the plain 1.5 m light of today
      // A cone skill (path null: reach × the kick's arc) lands only inside its reach, so SKILL says so the way Kick does (Combat,
      // 2026-09-27: a lit Dirty Jab pressed at 1.0–1.4 m started and whiffed). The reach is the equipped move's own; null = not a cone.
      const me = practice.duel.fighters[0], skillMove = me.skill ? weaponOf(me.weapon).moves[SKILL_MOVE[me.skill]!] : null;
      const inSkillReach = skillMove?.path === null ? gap <= skillMove.reach : null;
      const staminaNow = view.staminaShown ?? practice.stamina;   // ?stamina=N (fatigue-preview.ts): the BAR alone reads the forced number; accepts() and every button stay on the real stamina
      const lowNext = !!view.fatiguePreview && staminaLow(staminaNow, staminaLowOn);   // in the skip key below: the floor of stamina alone would hide a 10.0 / 10.7 crossing
      const key = `${view.slotB ? `B${view.slotBSpell ?? ''}` : ''}${practice.phase}:${practice.duel.fighters[0].lastMove ?? ''}:${practice.health}:${practice.playerHealth}:${Math.floor(staminaNow)}${lowNext ? 'L' : ''}:${Math.floor(practice.posture)}:${Math.floor(practice.enemyPosture)}:${hint}:${controlsReady}:${ok.join('')}${skillOk ? 1 : 0}:${practice.wound > 0}:${practice.exhausted}:${practice.threat}:${practice.threatMove}:${inKickReach}:${inSkillReach}:${view.replay ? 'r' : ''}${view.practiceOnly ? 'p' : ''}${view.stalled ? 's' : ''}${view.debug ? 'd' : ''}`;   // d: ?debug shown follows the test tools (#1093), so an admin opening them rewrites #debug
      if (key === lastHud) return;
      lastHud = key; staminaLowOn = lowNext;
      paintMeter(health, practice.health, practice.enemyMaxHealth);
      paintMeter(playerHealth, practice.playerHealth, practice.maxHealth); // an opponent may carry more than a man (moves.ts `Opponent.health`)
      element('health-value').textContent = `${practice.health} / ${practice.enemyMaxHealth}`;
      element('player-health-value').textContent = `${practice.playerHealth} / ${practice.maxHealth}`;
      fillMeter(stamina, staminaNow, 100);
      stamina.style.setProperty('--max', `${practice.maxStamina}%`);
      stamina.dataset.capped = String(practice.maxStamina < 100);   // a wound has lowered the ceiling: the bar draws a solid cap and a notch at --max (style.css)
      stamina.dataset.leg = String(practice.legWound); // attrition: the lost ceiling is shaded; a leg wound marks the bar
      stamina.value = staminaNow;
      stamina.dataset.low = String(staminaLowOn);   // ?look=fatigue-preview: red and a gentle pulse in the last 10 %, with hysteresis (style.css, fatigue-preview.ts)
      element('stamina-label').dataset.low = String(staminaLowOn);   // the STAMINA word goes red with the bar
      element('stamina-value').textContent = `${Math.floor(staminaNow)} / 100`;
      for (const [id, value] of [
        ['posture', practice.posture],
        ['target-posture', practice.enemyPosture],
      ] as const) {
        const meter = element<HTMLMeterElement>(id);
        meter.value = value;
        meter.style.setProperty('--fill', `${value}%`);
        meter.dataset.critical = String(value >= 70);
      }
      combatStatus.textContent = hint;
      element('stamina-label').dataset.mobile = practice.exhausted
        ? 'Stamina · exhausted'
        : practice.wound
          ? 'Stamina · wound'
          : 'Stamina';
      stamina.setAttribute(
        'aria-label',
        practice.exhausted
          ? 'Stamina — exhausted: no attacks or guard until it recovers'
          : practice.wound
            ? 'Stamina — wounded: recovery reduced 20 percent'
            : 'Stamina',
      );
      kickButton.hidden =
        practice.phase === 'sheathed' || practice.phase === 'draw' || !practice.health || !practice.playerHealth;
      kickButton.setAttribute('aria-disabled', String(!controlsReady || !ok[2]));
      kickButton.dataset.reach = String(inKickReach); // a kick has a short cone: the button brightens when it can land
      combatStatus.dataset.threat = String(practice.threat);
      combatStatus.dataset.move = practice.threatMove ?? '';
      const attackLabel = practice.phase === 'sheathed' ? 'Fight' : 'Light attack';
      const labelNode = attackButton.firstChild;   // the text node; the side-mark SVG after it must survive the rewrite
      if (labelNode && labelNode.nodeType === 3) { if (labelNode.textContent !== attackLabel) labelNode.textContent = attackLabel; } else attackButton.textContent = attackLabel;
      // Side hint: the cuts alternate, so the button lights the side of the NEXT one (none while sheathed — the button says Fight).
      const nextCut = practice.phase === 'sheathed' ? null : practice.duel.fighters[0].lastMove === 'light_right' ? 'left' : 'right';
      if ((attackButton.dataset.next ?? null) !== nextCut) { if (nextCut) attackButton.dataset.next = nextCut; else delete attackButton.dataset.next; }
      attackButton.dataset.mobile = practice.phase === 'sheathed' ? 'Fight' : 'Slash';
      attackButton.setAttribute('aria-label', attackLabel);
      thrustButton.hidden = !practice.health || !practice.playerHealth || practice.phase === 'sheathed';
      thrustButton.setAttribute('aria-disabled', String(!controlsReady || !accepts(practice, 'thrust')));
      // Keep receiving repeated touches while busy; native disabled can surrender them to browser zoom.
      attackButton.setAttribute('aria-disabled', String(!controlsReady || !ok[0]));
      const ended = !practice.health || !practice.playerHealth;
      heavyButton.hidden = ended;
      skillButton.hidden = ended;   // the seventh button follows Heavy's visibility
      const slotB = practice.duel.fighters[0].spell2 !== undefined || view.slotB === true;   // slot b is the fight's own, or (the open world's idle practice carries no spells) the page's say-so: an empty slot b shows no button (Strategy's ruling); the Pit never fills it
      skill2Button.hidden = ended || !slotB;
      const spell2Name = SPELL_OF_LEGEND[practice.duel.fighters[0].spell2?.id ?? view.slotBSpell ?? '']?.name ?? SPELL2_LABEL;   // the button says the spell's own catalogue name; an empty or unknown slot keeps the generic words; CSS clamps a long name to the button
      if (skill2Button.dataset.mobile !== spell2Name) {
        skill2Button.dataset.mobile = spell2Name; skill2Button.setAttribute('aria-label', spell2Name); skill2Button.title = spell2Name;
        const text = skill2Button.firstChild; if (text && text.nodeType === 3) text.textContent = spell2Name; else skill2Button.textContent = spell2Name;
      }
      skill2Button.setAttribute('aria-disabled', String(!controlsReady || !(view.slotB === true || accepts(practice, 'skill2'))));
      // Lit off the simulation's own test (legal: a skill equipped, not cooling, 40 stamina), never while cooling. No ring, no countdown.
      skillButton.setAttribute('aria-disabled', String(!controlsReady || !skillOk));
      if (inSkillReach === null) delete skillButton.dataset.reach; else skillButton.dataset.reach = String(inSkillReach);   // out of its cone: the cluster's dim, still pressable
      heavyButton.setAttribute('aria-disabled', String(!controlsReady || !ok[1]));
      attackButton.hidden = ended;
      // A stalled viewer page (record ran out, or the link never decoded) shows the button over the frozen frame: it is the only way on.
      resetButton.hidden = !ended && !view.stalled;
      const next = ended && !view.practiceOnly && !view.replay && won(practice.finish) ? view.next : undefined;   // the page's own pick (match.ts nextRung): label and button agree
      // "PLAY NOW" on a shared link, not "Avenge him" (owner 2026-09-22): a stranger does not know whose death they are avenging.
      resetButton.textContent = view.replay || view.stalled ? 'PLAY NOW' : view.lessonFight ? LESSON_NEXT : next ? 'Next fight' : 'Rematch';
      // On a viewer page PLAY NOW is the only live control on the screen (every combat button beside it is asleep), so it wears the
      // kill screen's primary rather than the dark glass it shares with Rematch — style.css `#reset-button[data-play='1']`.
      resetButton.dataset.play = view.replay || view.stalled ? '1' : '0';
      dodgeButton.setAttribute('aria-disabled', String(!controlsReady || !ok[3]));
      guardButton.setAttribute('aria-disabled', String(!controlsReady || !(ok[4] || practice.phase === 'guard')));
      guardButton.setAttribute('aria-pressed', String(practice.phase === 'guard'));
      element('debug').hidden = !view.debug;
    },
    // The journal's damage-numbers toggle turning off: whatever is floating disappears.
    hideDamage() {
      for (const span of dmgPool) span.hidden = true;
    },
    // Clarity cue 3 (Lead's brief): a press the sim refused dims and shakes its button for a moment, no text. The CSS class restarts on each refusal.
    refused(clarity: readonly ClarityEvent[]) {
      for (const c of clarity) {
        if (c.type !== 'PressRefused' || c.actor !== 0) continue;
        const button = c.action === 'heavy' ? heavyButton : c.action === 'thrust' ? thrustButton : c.action === 'kick' ? kickButton : c.action === 'skill' ? skillButton : c.action === 'skill2' ? skill2Button
          : c.action === 'dodge' || c.action === 'backstep' ? dodgeButton : c.action === 'parry' ? guardButton : attackButton;
        button.classList.remove('refused'); void button.offsetWidth; button.classList.add('refused');
        setTimeout(() => button.classList.remove('refused'), 260);
      }
    },
    // ?look=defence (defence-grade.ts): the GUARD button rings once in the colour of the grade the player's own defence just earned, and names it. Transform/ring only, nothing over the fighters.
    defended(events: readonly CombatEvent[]) {
      for (const e of events) {
        const grade = defenceGrade(e); if (!grade) continue;
        guardButton.dataset.defence = grade; guardButton.dataset.defenceLabel = GRADE_LABEL[grade];
        guardButton.classList.remove('defended'); void guardButton.offsetWidth; guardButton.classList.add('defended');
        clearTimeout(defendedTimer); defendedTimer = setTimeout(() => { guardButton.classList.remove('defended'); delete guardButton.dataset.defence; delete guardButton.dataset.defenceLabel; }, 520);
      }
    },
    floatDamage(
      events: CombatEvent[],
      fighters: readonly { body: { x: number; z: number }; scale: number }[],
      project: ((point: [number, number, number]) => [number, number] | null) | undefined,
    ): void {
      if (!dmgPool.length || typeof project !== 'function') return; // the VM harness ships an empty pool and a stub view: nothing to float there (the entry point gates on the journal setting)
      for (const e of events) {
        if (e.type !== 'Hit' || e.target === undefined || !e.damage) continue;
        const victim = fighters[e.target];
        const at = project([victim.body.x, 1.62 * victim.scale, victim.body.z]);
        if (!at) continue;
        const span = dmgPool[dmgCursor++ % dmgPool.length];
        span.textContent = String(Math.round(e.damage));
        span.className = `dmg${e.target === 0 ? ' taken' : ''}${e.counter || e.charged || HEAVY_MOVES.has(e.move ?? '') ? ' heavy' : ''}`;
        span.style.left = `${at[0]}px`;
        span.style.top = `${at[1]}px`;
        span.hidden = false;
        if (typeof span.animate === 'function')
          span.animate(
            [
              { transform: 'translate(-50%, 0)', opacity: 1 },
              { transform: 'translate(-50%, -44px)', opacity: 0 },
            ],
            { duration: 900, easing: 'ease-out', fill: 'forwards' },
          ).onfinish = () => {
            span.hidden = true;
          };
        else
          setTimeout(() => {
            span.hidden = true;
          }, 900);
      }
    },
  };
}
