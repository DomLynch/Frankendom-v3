// Rank looks on the opponent (docs/briefs/tier-looks-runtime.md, Strategy's streaming ruling): the fight opens on his base look (his
// fighter GLB + his carriers cut), and the rank look streams in only after first playable, then swaps on at the first idle beat, as one
// change, never mid-exchange, never in a finisher or the kill-cam. A look that lands late waits for the next idle beat; one that lands after
// the fight ends waits for the next fight (the swap stays armed). A look that fails to load leaves him in his base look, not the fight.
//
// Shipping looks (Lead, 2026-09-28): the Goblin met at rank level 2–10 wears L2–L10 (public/looks/goblin-L<n>.glb, Armour's packed4 files,
// each through the stream gate's rules); at level 1 he is his rig as shipped. The Plague Doctor the same, L2–L10 (Dom via Strategy/Lead,
// 2026-09-28: GPT's rank pack, packed by Armour to the look caps). The Knight the same, L2–L10 (Dom 18:2x via Strategy/Lead, 2026-09-28:
// GPT's pack at Strategy's 70k armour tris, Armour's packed files; two skinned draws, armour + gauntlets, on his rig's own joints).
// The Nightborn the same, L2–L10 (Dom 19:0x via Strategy/Lead): his built rig's 14 draws all go off (keep = []), the file is his whole
// fitted figure with its own head (L8–L10: the closed helm), his estoc stays.
// The Dwarf the same, L2–L10 (Dom 20:1x via Strategy/Lead): his CreatureBody and his two helmet draws go off (keep = []), his warhammer
// stays; GPT's known defects (pale L9 underarm, rough fingers, shoulder seams, plate rims) ship as delivered on Dom's word.
// The Witch the same, L2–L10 (Dom 2026-09-29 via Strategy: "witch is done now, check and integrate into game"): every one of her draws
// goes off (keep = []), the file is her whole fitted figure (L8–L10: the closed helm), her stock trident stays (Weapons' override); GPT's
// known defects (L4/L5 face fragments) ship as delivered. She has no finishers (roster finishers: []), so no waist-cut bake is ever taken.
// The Pitborn (Dom GO via Lead, 2026-09-29): L2–L10, full + phone, Armour's handover-l2l10 from GPT's pack, shipped as delivered. His
// built rig's 16 draws and his carriers go off under a keep = [] look; his cleaver stays. L8–L10 carry a split closed helm (Head 1.0).
// The Centurion (id veteran, Lead 2026-09-29): L2–L5 + L7–L10, full + phone, Armour's handover-l2l10 from GPT's pack, shipped as delivered.
// L6 is not in his set (GPT's L6 is a static Sand Legionary with no rig): that rank keeps his base rig. His CreatureBody, helmet and face
// draws go off under a keep = [] look; his weapon stays.
// The Shieldmaiden (Dom GO via Lead, 2026-09-29): L2–L10, full + phone, Armour's handover-l2l10 from GPT's pack, shipped as delivered.
// Her draws and carriers go off under a keep = [] look; her shield carrier (a Shield slot) and her drawn gladius stay.
// The Plague Doctor L1 "Recruit" (Dom 2026-09-30 via Lead, "integrate and get live"; the template for every opponent's new L1): GPT's
// delivery repacked to his L2 file's shape (garment + gloves only; the hidden original body, the longsword draws and the clips dropped), full +
// phone.
// The Executioner (Dom GO via Strategy/Lead, 2026-09-29): L2–L10, full + phone, Armour's handover-l2l10 from GPT's pack, shipped as
// delivered (L2–L7 open hood keeps GPT's weights). His draws and carriers go off under a keep = [] look; his scythe (trunk's) stays.
// The Executioner L1 "Recruit" (Strategy 2026-09-30, Dom "accelerate all"): GPT's selected delivery (HF revision 88e23e07, sha256 605d9b2a)
// as delivered, one draw (his hidden L2 shells and the unskinned scythe copies dropped; his trunk scythe stays); the phone simplifies the garment.
// The Dwarf L1 "Recruit" (Dom 2026-09-30 via Lead, "switch it and get live"): GPT's patched-linen recruit on his ORIGINAL body (head and
// beard his own), neckline repaired by Armour (hidden neck skin restored under the collar, donor-beard texels trimmed from the tunic). The full
// file ships GPT's maps and mesh as delivered (Strategy 2026-09-30, AAA ask; check-budget DESKTOP_LOOK_SET); only the -phone file is rebaked
// like his L2 (body + tunic in one 1024 atlas, tunic 24k tris).
// The Knight L1 "Recruit" (Strategy 2026-09-30, Dom's AAA ask): the full is GPT's mesh + maps as delivered (the unskinned maul copies and the
// hidden original body dropped; pack ASIS, no resize or lossy step); the phone is Armour's, owed.
// The Nightborn L1 "Recruit" (Strategy 2026-09-30, Dom's AAA-quality ask): the full is GPT's mesh + maps as delivered (only its two PNGs
// re-encoded to LOSSLESS webp, pixel-identical; Armour); the phone is his L2-phone recipe, one rebaked 1024 atlas.
// The Pitborn L1 "Recruit" (Lead 2026-09-30, Weapons on loan): GPT's delivery packed by Hero Look at GPT quality (q88, 1024, no trim; face,
// bone and his original helm steel + wrap kept, keep = []), full + phone; his full file has its own desktop cap (check-budget DESKTOP_LOOK_SET).
// The Plague Doctor's costume is fused into CreatureBody, so his files keep nothing of his (extras.keep = []): the look is the whole fitted figure. No other opponent has one until his files pass the gate. The
// dev flag `?ranklook=/looks/<name>.glb` streams a same-origin file directly under /looks/ onto whichever opponent the page fights (a file
// built for another rig simply does not fit), over the table.
import type { Practice } from './combat.ts';
import { offFlag } from '../off-flag.ts';
import type { Phase } from './duel.ts';
import type { FinisherId } from './finishers.ts';

const FLAG = /^\/looks\/[A-Za-z0-9_@.-]+\.glb$/;
export function rankLookFlag(search: string): string | undefined {
  const value = new URLSearchParams(search).get('ranklook');
  return value && FLAG.test(value) && !value.includes('..') ? value : undefined;
}
// The rank levels (grades.ts levelOf: Recruit 1 … Origin 10) each opponent has a shipping look for.
// The Witch L1 "Recruit" (Lead 2026-09-30, Weapons on loan): GPT's patched-cloth recruit packed at GPT quality (q88, 1024, no trim), her L2 file's
// shape (her skin surface + dark inner cowl + the garment, keep = []; GPT's alpha-0 original armour primitive and the trident draws dropped), full + phone.
// The Shieldmaiden L1 "Recruit" (Lead 2026-09-30, Weapons on loan): GPT's delivery packed at GPT quality (q88, 1024, no trim), her L2 file's draws
// (gloves, face, garment; keep = []; GPT's alpha-0 originals and the gladius draws dropped), full + phone. Her shield carrier stays, as at L2+.
export const SHIPPING_LOOKS: Readonly<Record<string, readonly number[]>> = { goblin: [2, 3, 4, 5, 6, 7, 8, 9, 10], plaguedoctor: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], knight: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], nightborn: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], dwarf: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], witch: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], pitborn: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], veteran: [2, 3, 4, 5, 7, 8, 9, 10], shieldmaiden: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], executioner: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
// Phone-tier LODs (Lead 2026-09-28, Dom's iPhone jitter at the Plague Doctor's L8–L10: GPU vertex/skinning bound): a set listed here also
// ships <opponent>-L<n>-phone.glb, the same look with its armour mesh simplified (meshopt) to ≤ 60k skinned vertices whole; textures,
// materials, skin and bones are the desktop file's own, except a draw the file names in extras.rebaked (too seam-dense to simplify in place:
// the Knight's L2–L6/L9/L10 armour, the Nightborn's armour and closed helm; one new atlas per file), and a draw it names in extras.resized
// (same mesh, material and texture slots, each desktop map downsized: the Nightborn L1 head, Lead + Strategy 2026-09-30). The phone tier streams it; desktop keeps the full file.
export const PHONE_LOOKS: ReadonlySet<string> = new Set(['plaguedoctor', 'knight', 'nightborn', 'dwarf', 'witch', 'pitborn', 'veteran', 'shieldmaiden', 'executioner']);
// Row 5b (map upload, MiB, RGBA + mips) by tier (Strategy 2026-09-30, Dom's AAA-quality ask): a -phone file, and the one file of a set without
// LODs, keeps 22 MiB (the phone's VRAM). A full-tier file of a PHONE_LOOKS set is served to fine-pointer desktops only (quality.ts
// detectPhoneTier), one look on screen, and integrated GPUs carry ~100 MiB of maps: 96 MiB, so GPT's 2048 maps can ship as delivered.
export const lookMapCapMiB = (opponent: string, phone: boolean): number => (phone || !PHONE_LOOKS.has(opponent) ? 22 : 96);
// His look file at the rank level he is met at, or none (his rig as shipped).
export const rankLookFor = (opponent: string, level: number, phone = false): string | undefined =>
  SHIPPING_LOOKS[opponent]?.includes(level) ? `/looks/${opponent}-L${level}${phone && PHONE_LOOKS.has(opponent) ? '-phone' : ''}.glb` : undefined;
// A rung change that changes his look file: the look streams once per page, so the rematch takes a fresh page (main.ts, Auditer #961).
export const rankLookMoves = (opponent: string, from: number, to: number): boolean => rankLookFor(opponent, from) !== rankLookFor(opponent, to);

// The idle beat: neither fighter is in an exchange (attack, riposte, parry, stagger, a roll) and no finish is playing. Ready, sheathed, the
// draw and a held guard are the quiet phases (a guard with its parry window open is not); a backstep is footwork out of an exchange, so it
// waits. A guard counts because a fighter who holds it all fight (the AI hero, measured: no beat in a whole replay without it) would
// otherwise never see his look.
const QUIET: readonly Phase[] = ['ready', 'sheathed', 'draw', 'guard'];
export const idleBeat = (practice: Practice): boolean =>
  !practice.finish && practice.duel.fighters.every((f) => QUIET.includes(f.phase) && !f.parrying);   // a stagger is the 'hurt' phase (`stun` is its length, left stale after it)

// 'none': this fight has no look (his rank has none); nothing is fetched and nothing is reported.
export type RankLookState = 'waiting' | 'none' | 'loading' | 'ready' | 'on' | 'failed';
// One look for one fight's opponent. `tick` is called every rendered frame with the practice on screen: the first frame the fight clock has
// moved (tick > 0, which only happens once the fight is playable) starts the fetch if nothing has, and the first idle beat of the running
// fight after it lands applies it. `prefetch` starts it earlier, once his rung is known and his rig is in (scene.ts setTier, before the
// Fight tap; Strategy via Lead 2026-09-30: L1 is a new player's first fight, and a full file streaming after Fight missed a short one), so
// the download, decode and warm-up happen behind the menu; the swap still waits for the fight clock and an idle beat.
// `load` decides when it starts (the rung he is met at is known by then); undefined = no look for this fight.
export function rankLookStream<T>(load: () => Promise<T> | undefined, apply: (look: T) => void, failed: (error: unknown) => void = () => {}) {
  let state: RankLookState = 'waiting', look: T | undefined, loadedAt = NaN, onAt = NaN, applyMs = NaN, run = 0;
  const waited: Record<string, number> = {};   // frames spent ready but off-beat, by what kept the beat away (the gate reads it)
  const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
  const start = () => {
    if (state !== 'waiting') return;
    const mine = ++run, pending = load();
    state = pending ? 'loading' : 'none';
    pending?.then((l) => { if (mine === run) { look = l; loadedAt = now(); state = 'ready'; } }, (error: unknown) => { if (mine === run) { state = 'failed'; failed(error); } });
  };
  return {
    state: (): RankLookState => state,
    // performance.now() stamps (NaN until they happen): the gate reads stream-in and swap times from these.
    stamps: () => ({ loaded: loadedAt, on: onAt, applyMs, waited }),
    prefetch: start,
    // His rung moved after a prefetch began (scene.ts setTier): the old rung's look is dropped, landed or not, and the next start loads the
    // new one. A look already on stays (a rung move that changes it takes a fresh page, main.ts).
    restart() { if (state === 'on') return; run++; state = 'waiting'; look = undefined; loadedAt = NaN; },
    tick(practice: Practice) {
      if (practice.duel.tick <= 0) return;   // behind the menu: nothing starts or swaps until the fight clock moves
      start();
      if (state === 'ready' && !idleBeat(practice)) {
        const key = practice.finish ? 'finish' : practice.duel.fighters.map((f) => `${f.phase}${f.parrying ? '+parry' : ''}`).join('/');
        waited[key] = (waited[key] ?? 0) + 1;
      }
      if (state === 'ready' && idleBeat(practice)) {
        state = 'on'; onAt = now();
        try { apply(look!); } catch (error) { state = 'failed'; failed(error); }
        applyMs = now() - onAt;
      }
    },
  };
}

// The safety net under the pre-swap bake (Strategy/Lead on #1025 row C, condition 3): an opened kill on him while a waist-cut bake is still
// pending plays a finisher that reads no bake, for that fight, and is logged; never a stall, never a cut through an unbaked helm.
// Finishers' pick (22:4x, Lead confirmed): runThrough, a pose and the blade through spine_02, nothing cut; plainDeath where he does not allow it.
export const bakeSafeFinisher = (finisher: FinisherId | null, victim: number, pending: boolean, allows: (f: FinisherId) => boolean = () => true): FinisherId | null =>
  finisher === 'opened' && victim === 1 && pending ? (allows('runThrough') ? 'runThrough' : 'plainDeath') : finisher;
// Forced, not a fallback (Strategy 22:27 via Lead): until the pre-swap bake passes row C with its three conditions, the closed helms at
// L8–L10 play runThrough wherever opened was picked, and no waist-cut bake is taken for these looks at all (none before the swap, none
// stepped after it, none at a rematch). The Dwarf (#1030) is ruled the same. Remove a set here once its row C passes.
export const RUN_THROUGH_LOOKS: Readonly<Record<string, readonly number[]>> = { nightborn: [8, 9, 10], dwarf: [8, 9, 10] };
export const runThroughForced = (url: string | undefined): boolean => {
  const m = url?.match(/^\/looks\/([a-z]+)-L(\d+)(?:-phone)?\.glb$/);
  return !!m && !!RUN_THROUGH_LOOKS[m[1]!]?.includes(Number(m[2]));
};
// Whether this fight's look takes a pre-swap waist-cut bake (characters.ts prepareLook): only for an opponent who can play opened (the Knight
// and the Plague Doctor, plainDeath only, take none: their swap timing is unchanged, Lead on 151e50e8), never at a forced rank, never with
// ?off=lookbake (the old ?lookbake=off still works).
export const lookBakes = (opensWaist: boolean, url: string | undefined, bakeOff = false): boolean => opensWaist && !bakeOff && !runThroughForced(url);

/** `?off=lookbake` (and the old `?lookbake=off`, kept so shared links work): no waist-cut bake for the look. Dev/gate only. */
export const lookBakeOffFrom = (search: string): boolean => offFlag(search, 'lookbake') || new URLSearchParams(search).get('lookbake') === 'off';
