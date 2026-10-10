// The match session (Lead (b) 2026-09-22, the GPT audit's one structural gap): the single owner of the fight's state and of every
// start, end and reset. main.ts wires the DOM, the renderer and the frame loop to this; nothing here touches the document, the
// network, a timer or the renderer, so tests/match.test.ts drives every mode through this same code.
// Four modes, explicit (the daily duel was removed: Dom 2026-09-29, "way over-complicated"):
//   career   — the ladder fight: the trial line, the scorecard row, one career mark and the loot offer on a win.
//   practice — a kill link's PLAY NOW: recorded, replayable, nothing awarded (avenged, not scored).
//   replay   — a kill link playing back: the record's own intents, no recorder, no AFK mark, nothing awarded.
//   sparring — an admin's test fight (src/sparring.ts, Dom 2026-09-26): any warden, level, weapon and move for this fight only; no recorder,
//              so no record, no share and no post, and nothing awarded or written (no trial line, no scorecard row, no mark).
//   pvp      — a live duel against another player (src/net/pvp.ts, docs/duel-architecture.md): the page's driver steps both men and hands
//              back this side's view; no recorder here (the rollback session keeps both streams) and nothing awarded (src/net/rewards.ts).
// Every reset goes through begin(): adding a piece of match state means clearing it in one place, not six.
import { initialPractice, stepPractice, PROFILES, type CombatEvent, type Intent, type Opponent, type Practice } from './combat.ts';
import { createRecorder, quantizeIntent, type FightRecord } from './record.ts';
import { recordSpecials } from './replay.ts';
import type { PickedStance } from './stance.ts';
// Phase two: class B from Veteran and all boss tiers are enabled in valid PvE fights. A record carries its own flag
// (version 21), so links made either way replay as they were fought.
const LIVE_SPECIALS = true;
import { LEVELS, LEVEL_ANCHORS, opponentAt, profileAt, type SkillId, type WeaponId } from './moves.ts';
import { recordPractice, recordRematch, saveTrial, type Trial } from '../trial.ts';
import { recordResult, saveScorecard, type Scorecard } from '../scorecard.ts';
import { awardMark, levelOf, marksOf, turnDial, RANK_STEPS, TITLES } from '../career.ts';
import { autopsy } from '../autopsy.ts';
import { readOpponent } from './ai.ts';
import { idleIntent, roundPose, type Duel, type DuelPose } from './duel.ts';
import { nextArena, nextOpponent, passKey, won } from '../ladder.ts';
import type { ArenaKey } from '../arena-themes.ts';
import type { RecordArena } from './record.ts';
import { defeat, type LootId } from '../core/loot.ts';
import { stepSparring, type SparringKit } from '../sparring.ts';
import { createFirstLoss, type LessonId } from '../first-loss.ts';
import { createTutorial, type TutorialStep } from '../tutorial.ts';
import type { Profile, StoragePort } from '../core/profile.ts';
import { underRecord } from './detmath.ts';
import { FIRST_STAB_VERSION, STAB_ON, setStab } from './stab-rule.ts';
import { FIRST_LATE_NOTICE_VERSION, LATE_NOTICE, PLAY_SCALE, playScaleFor, setLateNotice, setPlayScale } from './play-radius.ts';
import { sparringSpecialDuel, validateSparringSpecialSelection, type SparringSpecialSelection } from './sparring-special-runtime.ts';
import { bossSpecialFor } from './special-identity.ts';
import { classSpecialFor } from './class-special-identity.ts';
import type { SpecialTest } from './special-look.ts';

const CLASS_B_FROM = 1 + RANK_STEPS * TITLES.indexOf('Veteran');   // rank 4, level 16 in the canonical career ladder

export type Mode = 'career' | 'practice' | 'replay' | 'sparring' | 'pvp' | 'lesson' | 'tutorial';
export type SpecialIdentity = Readonly<{ opponent: Opponent['id']; level: number; presets?: readonly [SpecialTest | null, SpecialTest | null] }>;
// The live duel's driver (src/net/pvp.ts PvpDuel), by shape only: this file imports nothing from src/net. `settled`: the finish is in the
// state stepped on both players' real intents, so no rollback can take it back.
export type PvpDriver = { frame(intent: Intent): Practice; readonly practice: Practice; readonly settled: boolean; readonly rollbacks?: number };
export type Difficulty = keyof typeof PROFILES;   // a named preset (sparring links, the dev picker): its level is PRESET_LEVEL's
export const PRESET_LEVEL: Record<Difficulty, number> = { easy: LEVEL_ANCHORS.easy, normal: LEVEL_ANCHORS.normal, hard: LEVEL_ANCHORS.hard };
export const DAILY_LEVEL = PRESET_LEVEL.normal;   // the server's daily verifier (scripts/verify-daily.mjs) replays at this level; the client no longer fights dailies (Dom 2026-09-29)
type Recorder = ReturnType<typeof createRecorder>;
// What the page keeps and the match writes: the device's trial tally, scorecard and fighter profile, and the storage they save to.
// `rank`: the career's rank level (main.ts: levelOf(careerMarks()), the server figure once there); absent, the device count's.
export type MatchPorts = { storage: StoragePort; trial: Trial; scorecard: Scorecard; profile: Profile; rank?: () => number; arena?: () => RecordArena | undefined };   // arena: the arena this page built, named in a live fight's record (record.ts version 26)
// The end of a fight, for the page to show: the record (null in a replay, or when a mid-fight difficulty change dropped the
// recorder), the autopsy lines, whether the player won and whether the fight counted (career only).
export type Ended = { record: FightRecord | null; lines: string[]; won: boolean; rewarded: boolean };
// The rematch seed: a different warden every rematch, deterministic from the last (the browser gate times the fixed 731 opener).
export const nextSeed = (seed: number): number => (Math.imul(seed, 1664525) + 1013904223) >>> 0;

export class Match {
  mode: Mode = 'career';
  seed: number;
  skill: SkillId | null = null;   // the player's equipped skill (moves.ts SkillId), set as `weapon` is; the profile's (loot.skill, main.ts) through the constructor; a replay takes the record's
  weapon: WeaponId;   // the player's weapon (moves.ts PLAYER_WEAPONS): the equipped one (loot.ts fightWeapon) the page booted with; a replay takes the record's
  private sparSpecials: { first: number; level?: number; enabled?: boolean } | null = null;   // preview level/off can differ from ordinary live specials; body/AI stay on difficulty
  private sparSelection?: SparringSpecialSelection;
  private sparLegacySkill: SkillId | null = null;
  startPose: DuelPose | undefined = undefined;   // seamless step 3 (RV38): the open world's hero/foe positions and hero facing, arena-local metres; the NEXT career/practice/sparring begin() takes it (one shot, so a rematch starts at the pit marks) and the record carries it as v38
  fightPose: DuelPose | undefined = undefined;   // the pose THIS fight began from (float32-rounded), or undefined: a sparring Match keeps no recorder, so the page that records it (origins/preview/world-record.ts) passes this to createRecorder as `pose`
  stancePref: PickedStance | undefined = undefined;   // the stance preview's pick (src/stance-panel.ts, ?stances=): a live career/practice fight takes it at begin(); undefined = no stances, every live fight today
  stances: PickedStance | undefined = undefined;   // the player's stance pick (src/fight/stance.ts, RV34): undefined = a fight without stances, which is every live fight until a flag turns them on; a replay takes its record's own
  gambit = false;   // the Gambit (RV33, src/fight/gambit.ts): off in every live fight until a flag turns it on; a replay takes its record's own
  specials = LIVE_SPECIALS;   // PvE default; begin excludes PvP and preserves a replay's own flag
  level: number = PRESET_LEVEL.normal;   // the opponent's ladder level, 1–50 (moves.ts profileAt): the career's for a ladder fight (career.ts levelOf)
  practice: Practice;
  recorder: Recorder | null = null;
  layer: ((duel: Duel, warden: Intent) => Intent) | null = null;   // a world layer on the live warden (src/fight/mobkit.ts, set by the creature encounter / a ?mob= spar); never set for a ladder fight or a replay
  recorded = false;
  private ended: Ended | null = null;   // end() once: a second call hands back the same result with nothing re-awarded
  activeMs = 0;   // real unpaused wall-clock of the current fight (hit-stop included), beside the simulation's tick count
  frameEvents: CombatEvent[] = [];   // this frame's events, for the renderer; main.ts empties it after each draw
  fightLog: CombatEvent[] = [];   // every event of the current fight, for the death-screen autopsy (src/autopsy.ts reads the whole fight)
  lastRecord: FightRecord | null = null;
  lastDrop: LootId | null = null;   // the piece this fight dropped, so a Share can fill its record id once (src/core/loot.ts Provenance)
  lastSkill: SkillId | null = null;   // the move this fight's take stored instead of a piece: the one take per win covers both
  replay: { record: FightRecord; cursor: number } | null = null;
  pvp: PvpDriver | null = null;
  private clipLevel: number | null = null;   // an export clip's re-play steps on its record's level (startClip); any start clears it
  private fightIdentity!: SpecialIdentity;   // captured when the practice is built, independent of later picker changes
  stalled = false;   // a viewer page that cannot go on: the record ran out before its finish, or the link never decoded
  // A fight on the Options tab's Dev kit (main.ts: a level off the dial, a weapon or move off the equipped one; Lead 2026-09-27): practice
  // only, whatever the mode says. No ladder step, mark, dial turn, scorecard or card row, no loot offer: an admin's
  // testing never moves his own progress, and never sends the server a claim its verifier would refuse.
  tested = false;
  lesson: ReturnType<typeof createFirstLoss> | null = null;   // the scripted first loss (src/first-loss.ts, mode 'lesson'): its script, which owns the foe
  tutorial: ReturnType<typeof createTutorial> | null = null;   // the tutorial start scene's slow foe (src/tutorial.ts, mode 'tutorial')
  private onLesson: (id: LessonId) => void = () => {};
  private onTutorial: (id: TutorialStep) => void = () => {};
  dummy = false;   // a sparring fight against the no-attack dummy (src/sparring.ts stepSparring); `level` then holds easy's, the dummy's base
  // Counts every start. A loader that was asked before a start (a kill link's fetch) hands its epoch back
  // with the record; a stale epoch is refused, so a late response never overwrites a newer match.
  epoch = 0;
  readonly opponent: Opponent;
  private readonly build: string;
  private readonly ports: MatchPorts;
  // `level` is the career's (main.ts, career.ts levelOf): set before begin(), so the first fight's recorder is born on it.
  constructor(opponent: Opponent, build: string, ports: MatchPorts, seed = 731, weapon: WeaponId = 'longsword', skill: SkillId | null = null, level: number = PRESET_LEVEL.normal) {
    this.opponent = opponent; this.build = build; this.ports = ports;
    this.seed = seed; this.weapon = weapon; this.skill = skill; this.level = level;
    this.practice = initialPractice(seed, opponentAt(opponent, this.level), this.weapon, this.skill);
    this.begin('career');
  }
  get practiceOnly(): boolean { return this.mode !== 'career' || this.tested; }   // a stances fight COUNTS (Dom 2026-10-08, stances ON for all): scripts/ladder-stance-count.mjs found no rung that a stance pick makes unwinnable or trivial (Balanced within 2 points of the no-stance baseline); it was practice-only while it was a preview
  get specialIdentity(): SpecialIdentity {
    const identity = this.replay?.record ?? this.fightIdentity;
    return { opponent: identity.opponent, level: identity.level, ...(this.mode === 'sparring' && this.clipLevel === null && this.sparSelection ? { presets: [this.sparSelection.player, this.sparSelection.opponent === undefined ? (this.practice.duel.fighters[1].specialShare === undefined ? null : bossSpecialFor(identity.opponent, this.sparSpecials?.level ?? identity.level) ?? classSpecialFor(identity.opponent, this.sparSpecials?.level ?? identity.level)) : this.sparSelection.opponent] as const } : {}) };
  }
  // The one reset. Everything a fight owns starts here; `seed`, `weapon` and `level` are set by the caller first.
  private begin(mode: Mode) {
    this.mode = mode;
    if (mode !== 'replay') { setPlayScale(mode === 'pvp' ? 1 : playScaleFor(this.opponent.id, Infinity)); setLateNotice(true); setStab(true); }   // a live fight is fought in this build's circle for its warden (PvP is not Arena 1: the original); a replay's is set by startReplay, before begin (play-radius.ts)
    if (mode !== 'sparring') { this.dummy = false; if (this.sparSelection && mode !== 'replay') this.skill = this.sparLegacySkill; this.sparSelection = undefined; }
    if (mode !== 'pvp') this.pvp = null;
    this.lesson = mode === 'lesson' ? createFirstLoss(this.onLesson) : null;
    this.tutorial = mode === 'tutorial' ? createTutorial(this.onTutorial) : null;
    this.epoch++;
    const pose = (mode === 'career' || mode === 'practice' || mode === 'sparring' || mode === 'replay') && this.startPose ? roundPose(this.startPose) : undefined; this.startPose = undefined; this.fightPose = pose;
    const test = mode === 'sparring' ? this.sparSpecials : null;
    const live = LIVE_SPECIALS && !this.dummy && Number.isInteger(this.level) && this.level >= CLASS_B_FROM && this.level <= LEVELS;
    if (mode !== 'replay') { this.gambit = false; this.stances = mode === 'career' || mode === 'practice' ? this.stancePref : undefined; }   // only a replay carries the Gambit until a live flag exists
    if (mode !== 'replay') this.specials = mode !== 'pvp' && (test ? test.enabled !== false : live);   // previews/off explicit; replay retains its recorded phase
    this.fightIdentity = { opponent: this.opponent.id, level: this.level };
    this.practice = initialPractice(this.seed, opponentAt(this.opponent, this.level), this.weapon, this.skill, recordSpecials({ specials: this.specials, level: test?.level ?? this.level, opponent: this.opponent.id }), this.gambit ? this.seed : undefined, this.stances, pose);   // preview identity/share only; body/AI remain on the visible difficulty
    if (test && this.specials) for (const f of this.practice.duel.fighters) f.skillCooldown = test.first;   // a test page's early first cast (special-look.ts); sparring keeps no record
    if (mode === 'sparring' && this.sparSelection) {
      this.practice = { ...this.practice, duel: sparringSpecialDuel(this.practice.duel, this.sparSelection) };
      this.skill = this.practice.duel.fighters[0].skill;
      this.specials = this.practice.duel.fighters.some(f => f.specialShare !== undefined);
    }
    this.recorder = mode === 'replay' || mode === 'sparring' || mode === 'pvp' || mode === 'lesson' || mode === 'tutorial' ? null : createRecorder({ build: this.build, opponent: this.opponent.id, weapon: this.weapon, ...(this.ports.arena?.() ? { arena: this.ports.arena() } : {}), ...(this.skill ? { skill: this.skill } : {}), ...(this.specials ? { specials: true } : {}), ...(this.gambit ? { gambit: true } : {}), ...(this.stances ? { stances: this.stances } : {}), ...(pose ? { pose } : {}), level: this.level, seed: this.seed });
    this.recorded = false; this.ended = null; this.activeMs = 0;
    this.frameEvents = []; this.fightLog = [];
    this.lastRecord = null; this.lastDrop = null; this.lastSkill = null;
    this.replay = null; this.stalled = false; this.clipLevel = null;
  }
  // Rematch: the same warden, differently seeded. A career fight stays career; a practice fight stays practice.
  rematch() {
    if (this.mode === 'pvp') return;   // a new duel is a new challenge link (the peer has to agree to it)
    if (this.mode === 'tutorial') { this.seed = nextSeed(this.seed); this.begin('tutorial'); return; }   // the tutorial writes nothing, rematches included
    if (this.mode === 'lesson') { this.seed = nextSeed(this.seed); this.begin('lesson'); return; }   // the first loss writes nothing, rematches included
    if (this.mode === 'sparring') { this.seed = nextSeed(this.seed); this.begin('sparring'); return; }   // sparring writes nothing, rematches included
    recordRematch(this.ports.trial); saveTrial(this.ports.storage, this.ports.trial);
    this.seed = nextSeed(this.seed);
    this.begin(this.mode === 'career' ? 'career' : 'practice');
  }
  // PLAY NOW on a viewer page: the same warden and the record's seed (a stalled page keeps the seed it has), live, practice only.
  playNow() {
    if (this.replay) this.seed = this.replay.record.seed;
    this.begin('practice');
  }
  // After a career win the ladder moves on; the next fighter is another rig, so the page reloads on that rung (main.ts).
  // After a career win: the next opponent, a random pick from the pass's unbeaten (ladder.ts nextOpponent), and the pass to store with it.
  nextRung(): { id: Opponent['id']; name: string; pass: Opponent['id'][]; arena: ArenaKey; arenaPass: ArenaKey[] } | undefined {
    const { profile } = this.ports;
    if (this.practiceOnly || !won(this.practice.finish)) return undefined;
    const key = passKey(profile.id, marksOf(profile)), next = nextOpponent(this.opponent.id, profile.pass ?? [], key), a = nextArena(profile.arena ?? '1', profile.arenaPass ?? [], key);   // the arena draws with the opponent: a win moves both, a rematch neither
    return { ...next, arena: a.arena, arenaPass: a.pass };
  }
  // A kill link: the fight on the record's seed, weapon and warden profile, stepped silently to fromTick and played from there.
  // Refused (false) when a start happened after the link was asked for: the fight now in play stays.
  startReplay(record: FightRecord, fromTick: number, epoch: number): boolean {
    if (epoch !== this.epoch || record.group) return false;   // a group stream replays only with its siblings (RV39)
    this.seed = record.seed; this.weapon = record.weapon; this.skill = record.skill ?? null; this.level = record.level; this.specials = !!record.specials; this.gambit = !!record.gambit; this.stances = record.stances; this.startPose = record.pose;   // a posed (v38) record replays from its own start, never the pit marks
    underRecord(record, () => {   // built and stepped on the record's own version of the sim's math (detmath.ts)
      this.begin('replay');
      for (let tick = 0; tick < fromTick; tick++) this.practice = stepPractice(this.practice, record.intents[tick], profileAt(this.opponent, this.level));
    });
    this.replay = { record, cursor: fromTick };
    setPlayScale(playScaleFor(record.opponent, record.v));   // the circle the record was fought in stays for as long as it plays (the scene and camera read it)
    return true;
  }
  // Export clip (src/clip.ts): the ended fight's own record re-played from fromTick on the page as it stands, without a start: the
  // mode, the result, the record, the drop and the epoch stay, so the kill screen (Next, the loot offer, Share) is the same after it.
  // end() was already called (`recorded`), so the re-play's killing tick is never 'ended' again; past it the clip plays on (step).
  // Returns what endClip() puts back.
  startClip(record: FightRecord, fromTick: number) {
    const saved = { scale: PLAY_SCALE, notice: LATE_NOTICE, stab: STAB_ON, practice: this.practice, replay: this.replay, stalled: this.stalled, fightLog: this.fightLog, specials: this.specials, gambit: this.gambit, stances: this.stances };
    this.clipLevel = record.level;   // the record's own warden; `level` is untouched, so any start mid-clip fights on the player's own (Auditer review)
    const practice = underRecord(record, () => {
      let p = initialPractice(record.seed, opponentAt(this.opponent, record.level), record.weapon, record.skill ?? null, recordSpecials(record), record.gambit ? record.seed : undefined, record.stances, record.pose);
      for (let tick = 0; tick < fromTick; tick++) p = stepPractice(p, record.intents[tick], profileAt(this.opponent, record.level));
      return p;
    });
    this.practice = practice; this.specials = !!record.specials; this.gambit = !!record.gambit; this.stances = record.stances; this.replay = { record, cursor: fromTick }; this.fightLog = []; this.frameEvents = [];
    setPlayScale(playScaleFor(record.opponent, record.v)); setLateNotice(record.v >= FIRST_LATE_NOTICE_VERSION); setStab(record.v >= FIRST_STAB_VERSION);
    return saved;
  }
  endClip(saved: ReturnType<Match['startClip']>) {
    setPlayScale(saved.scale); setLateNotice(saved.notice); setStab(saved.stab); this.practice = saved.practice; this.replay = saved.replay; this.stalled = saved.stalled; this.clipLevel = null; this.fightLog = saved.fightLog; this.specials = saved.specials; this.gambit = saved.gambit; this.stances = saved.stances;
    this.frameEvents = [];
  }
  // The rig could not carry the weapon (its equip file failed): the fight is fought with the one it does carry, so drawn = simulated.
  // A live fight starts over on it (the rigs land before the controls wake: nothing the player did is lost); a replay cannot change
  // weapon, so it becomes the unreadable-link page and PLAY NOW fights on the carried one. False when the weapon was already the carried one.
  rearm(weapon: WeaponId): boolean {
    if (weapon === this.weapon || this.mode === 'pvp') return false;   // a live duel's kits were agreed with the peer: never swapped under it
    this.weapon = weapon;
    const replay = this.mode === 'replay';
    this.begin(replay ? 'practice' : this.mode);
    this.stalled = replay;   // the unreadable-link page: one line, PLAY NOW under it
    return true;
  }
  // Sparring: the picked kit for this fight only. The profile (equipped weapon, skill, loot) is never touched; a rematch keeps the kit.
  // `specials`: Special Moves on for this sparring page only (?special=, special-look.ts); a rematch keeps them, any other start drops them.
  startSparring(kit: SparringKit, specials: { first: number; level?: number; enabled?: boolean } | null = null, selection?: SparringSpecialSelection): void {
    if (selection) validateSparringSpecialSelection(kit, selection);
    this.sparSelection = selection ? { ...selection } : undefined;
    this.sparLegacySkill = kit.skill;
    this.sparSpecials = specials;
    this.weapon = kit.weapon; this.skill = kit.skill;
    this.dummy = kit.difficulty === 'dummy'; this.level = typeof kit.difficulty === 'number' ? kit.difficulty : PRESET_LEVEL[kit.difficulty === 'dummy' ? 'easy' : kit.difficulty];
    this.begin('sparring');
  }
  // The scripted first loss (src/first-loss.ts): the longsword against this warden at easy's body, a script for his swings, the fight lost on purpose.
  // `onLesson` fires once per lesson in teaching order (the page turns each id into a prompt); a rematch tells it again. Nothing is recorded or awarded.
  startLesson(onLesson: (id: LessonId) => void): void {
    this.onLesson = onLesson; this.weapon = 'longsword'; this.skill = null; this.dummy = false; this.level = PRESET_LEVEL.easy;
    this.begin('lesson');
  }
  // The tutorial start scene (src/tutorial.ts): the longsword against a slow warden who waits on each step. `onDone` fires once per step, in order.
  // Nothing is recorded or awarded; the fight never ends by itself.
  startTutorial(onDone: (id: TutorialStep) => void): void {
    this.onTutorial = onDone; this.weapon = 'longsword'; this.skill = null; this.dummy = false; this.level = PRESET_LEVEL.easy;
    this.begin('tutorial');
  }
  // A live duel (src/net/pvp.ts): the driver owns the fight from here; the page reloads to leave it.
  startPvp(driver: PvpDriver): void {
    this.begin('pvp');
    this.pvp = driver; this.practice = driver.practice;
  }
  // The journal's difficulty cycle: a fight that changed warden mid-way is no longer replayable from one profile, so its recorder drops.
  // Before the draw nothing has happened yet (the player is still sheathed; the idle ticks since boot are all the recorder holds), so the
  // fight starts over on the new warden and keeps its record, and Share: dropping it there hid Share for any fight whose difficulty
  // was touched on the welcome screen (web, 2026-09-25). The epoch stays: a kill link asked for before the change still lands.
  setLevel(level: number) {
    // A re-play steps its record on the record's profile: a change there would make another fight (a kill link's wrong outcome or
    // 'stalled'). Refused before the assignment; the label reads it back (Combat review, 2026-09-26).
    if (this.replay) return;
    if (!Number.isInteger(level) || level < 1 || level > LEVELS) return;   // a bad pick ('' from a stale option, NaN) never becomes a warden
    this.level = level;
    // Before the first tick too (the welcome screen pauses the sim): the recorder's header was written at the start, so it restarts on
    // the new profile. Returning early there left a record on 'normal' for a fight on 'easy', which no link or clip could re-play (web, 2026-09-26).
    if (!this.recorder || this.practice.finish) return;
    if (this.recorder.ticks === 0 || this.practice.duel.fighters[0].phase === 'sheathed') { const epoch = this.epoch; this.begin(this.mode); this.epoch = epoch; }
    else { this.recorder = null; this.tested = true; }   // no record, so it never counts: a claim would hold nothing for the verifier to replay (Combat, #917)
  }
  // One simulation tick. A replay steps the record's next intent; a live fight steps the quantized live one (the recorder keeps it),
  // so live and replay see the same bits. 'stalled': the record ran out without its finish (this build steps it differently).
  // 'ended': this tick finished the fight, and end() is owed once.
  step(live: () => Intent): 'stepped' | 'ended' | 'stalled' {
    if (this.pvp) {   // the driver quantizes and schedules the intent; a finish ends the match only once no rollback can undo it
      this.practice = this.pvp.frame(live());
      this.frameEvents.push(...this.practice.events); this.fightLog.push(...this.practice.events);
      return this.practice.finish && this.pvp.settled && !this.recorded ? 'ended' : 'stepped';
    }
    // Past the record's last tick: a watched fight that reached its finish plays on as a live one does after the kill (the clock runs, the
    // dead stay down, nobody acts); only a record that runs out BEFORE its finish is stale. (Until 2026-09-28 every kill link stalled here
    // one frame after "Replay over" and the page called it "Recorded on an older build".) A clip (clipLevel set) plays on the same way, so its
    // finisher and kill camera move (Lead B2, 2026-09-30: it stalled on the killing tick and the clip's last seconds were one still frame).
    const over = this.replay && this.replay.cursor >= this.replay.record.ticks;
    if (over && !((this.mode === 'replay' || this.clipLevel !== null) && this.practice.finish)) { this.stalled = true; return 'stalled'; }
    const stepped = over ? idleIntent() : this.replay ? this.replay.record.intents[this.replay.cursor++]! : this.recorder ? this.recorder.push(live()) : quantizeIntent(live());
    const step = () => stepPractice(this.practice, stepped, profileAt(this.opponent, this.clipLevel ?? this.level), this.replay ? undefined : this.layer ?? undefined);
    this.practice = this.tutorial ? this.tutorial.step(this.practice, stepped) : this.lesson ? this.lesson.step(this.practice, stepped) : this.dummy ? stepSparring(this.practice, stepped) : this.replay ? underRecord(this.replay.record, step) : step();   // a replay or clip steps on its record's math
    this.frameEvents.push(...this.practice.events); this.fightLog.push(...this.practice.events);
    return this.practice.finish && !this.recorded ? 'ended' : 'stepped';
  }
  // The end of the fight, once: the record is finished, the autopsy read, and the reward rule applied — a career fight writes the trial
  // line, the scorecard row and (on a win) the career mark;
  // practice and replay write nothing. `afk`: the fight ended while the player was away (a loss flagged left on the scorecard).
  // Once per fight, enforced here and not only by the caller (GPT audit 2026-09-24, finding D): before the finish it throws (there is
  // no result to record); after the first call it returns that result with `rewarded` false, so a repeat never awards again.
  end(afk: boolean): Ended {
    const { practice, opponent, ports } = this, finish = practice.finish;
    if (!finish) throw new Error('Match.end() before the fight finished');
    if (this.mode === 'pvp' && !this.pvp?.settled) throw new Error('Match.end() before the PvP result settled');
    if (this.ended) return { ...this.ended, rewarded: false };
    this.recorded = true;
    if (this.mode === 'replay') return this.ended = { record: null, lines: [], won: false, rewarded: false };
    if (this.mode === 'sparring' || this.mode === 'pvp' || this.mode === 'lesson') return this.ended = { record: null, lines: [], won: won(finish), rewarded: false };   // no record, no mark, no row: nothing leaves the fight
    const record = this.recorder ? this.recorder.finish(finish.draw ? 'draw' : finish.victim === 1 ? 'killed' : 'died') : null;
    this.lastRecord = record;
    const lines = autopsy(practice.ai.habits, readOpponent(practice.ai.habits), this.fightLog, practice.duel);
    const rewarded = !this.practiceOnly, victory = won(finish);
    if (rewarded) {   // an avenged fight is practice: it never touches the card, the scorecard or the marks
      recordPractice(ports.trial, practice, Math.round(this.activeMs));
      saveTrial(ports.storage, ports.trial);
      recordResult(ports.scorecard, opponent.id, victory ? 'win' : finish.draw ? 'draw' : 'loss', afk, lines);   // a fight lost while away is a loss, flagged left
      saveScorecard(ports.storage, ports.scorecard);
      if (!finish.draw) ports.profile.dial = turnDial(ports.profile.dial, ports.rank?.() ?? levelOf(marksOf(ports.profile)), victory);   // before the mark lands: the dial reads the rank the fight was fought at; a draw leaves it
      if (victory) { awardMark(ports.profile); ports.profile.loot = defeat(ports.profile.loot, opponent.id, this.level); this.lastDrop = null; }   // one career mark per won duel (owner beta policy 2026-09-20) + the legend's skull at the fight's rung (loot.ts defeats), taken or not; the loot offer is the page's
    }
    return this.ended = { record, lines, won: victory, rewarded };
  }
}
// The line a live fight shows when the rig could not carry the equipped weapon (Lead P1, 2026-09-26: the fallback was silent outside a
// replay). Nothing is unequipped: the loot keeps the weapon, and the next page load asks for its file again.
export const equipNotice = (asked: WeaponId, carried: WeaponId): string => `Your ${asked} could not load; fighting with the ${carried}`;
