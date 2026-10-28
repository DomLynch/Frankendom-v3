// The lazy loaders of the baked clip JSONs' 106 versions (OpenTrident's retargets, one set per 106 body: src/assets/106/<body>/). Which
// file a body plays is data/rig.json clips106 (rig-bones.ts clip106Path); this table only makes each path a literal dynamic import, so the
// build writes it as its own .json.js module fetched when used (scripts/build.mjs), as the 65 files are. test/rig-bones.test.mjs keeps the
// table and the data row equal.
import { clip106Path } from './rig-bones.ts';

type Loader = () => Promise<{ default: unknown }>;
export const CLIP_106_LOADERS: Record<string, Loader> = {
  '106/psyche/special-skullcrack.json': () => import('../assets/106/psyche/special-skullcrack.json'),
  '106/psyche/special-whirlwind.json': () => import('../assets/106/psyche/special-whirlwind.json'),
  '106/psyche/special-groundslam.json': () => import('../assets/106/psyche/special-groundslam.json'),
  '106/psyche/special-lunge.json': () => import('../assets/106/psyche/special-lunge.json'),
  '106/psyche/execution-killer.json': () => import('../assets/106/psyche/execution-killer.json'),
  '106/psyche/execution-victim-hero.json': () => import('../assets/106/psyche/execution-victim-hero.json'),
  '106/psyche/hamstrung-killer.json': () => import('../assets/106/psyche/hamstrung-killer.json'),
  '106/psyche/hamstrung-victim-hero.json': () => import('../assets/106/psyche/hamstrung-victim-hero.json'),
  '106/minotaur/special-skullcrack.json': () => import('../assets/106/minotaur/special-skullcrack.json'),
  '106/minotaur/special-whirlwind.json': () => import('../assets/106/minotaur/special-whirlwind.json'),
  '106/minotaur/special-groundslam.json': () => import('../assets/106/minotaur/special-groundslam.json'),
  '106/minotaur/special-lunge.json': () => import('../assets/106/minotaur/special-lunge.json'),
  '106/minotaur/execution-killer.json': () => import('../assets/106/minotaur/execution-killer.json'),
  '106/minotaur/execution-victim-hero.json': () => import('../assets/106/minotaur/execution-victim-hero.json'),
  '106/minotaur/hamstrung-killer.json': () => import('../assets/106/minotaur/hamstrung-killer.json'),
  '106/minotaur/hamstrung-victim-hero.json': () => import('../assets/106/minotaur/hamstrung-victim-hero.json'),
  '106/gargantua/special-skullcrack.json': () => import('../assets/106/gargantua/special-skullcrack.json'),
  '106/gargantua/special-whirlwind.json': () => import('../assets/106/gargantua/special-whirlwind.json'),
  '106/gargantua/special-groundslam.json': () => import('../assets/106/gargantua/special-groundslam.json'),
  '106/gargantua/special-lunge.json': () => import('../assets/106/gargantua/special-lunge.json'),
  '106/gargantua/execution-killer.json': () => import('../assets/106/gargantua/execution-killer.json'),
  '106/gargantua/execution-victim-hero.json': () => import('../assets/106/gargantua/execution-victim-hero.json'),
  '106/gargantua/hamstrung-killer.json': () => import('../assets/106/gargantua/hamstrung-killer.json'),
  '106/gargantua/hamstrung-victim-hero.json': () => import('../assets/106/gargantua/hamstrung-victim-hero.json'),
  '106/arachne/special-skullcrack.json': () => import('../assets/106/arachne/special-skullcrack.json'),
  '106/arachne/special-whirlwind.json': () => import('../assets/106/arachne/special-whirlwind.json'),
  '106/arachne/special-groundslam.json': () => import('../assets/106/arachne/special-groundslam.json'),
  '106/arachne/special-lunge.json': () => import('../assets/106/arachne/special-lunge.json'),
  '106/arachne/execution-killer.json': () => import('../assets/106/arachne/execution-killer.json'),
  '106/arachne/execution-victim-hero.json': () => import('../assets/106/arachne/execution-victim-hero.json'),
  '106/arachne/hamstrung-killer.json': () => import('../assets/106/arachne/hamstrung-killer.json'),
  '106/arachne/hamstrung-victim-hero.json': () => import('../assets/106/arachne/hamstrung-victim-hero.json'),
  '106/demon/special-skullcrack.json': () => import('../assets/106/demon/special-skullcrack.json'),
  '106/demon/special-whirlwind.json': () => import('../assets/106/demon/special-whirlwind.json'),
  '106/demon/special-groundslam.json': () => import('../assets/106/demon/special-groundslam.json'),
  '106/demon/special-lunge.json': () => import('../assets/106/demon/special-lunge.json'),
  '106/demon/execution-killer.json': () => import('../assets/106/demon/execution-killer.json'),
  '106/demon/execution-victim-hero.json': () => import('../assets/106/demon/execution-victim-hero.json'),
  '106/demon/hamstrung-killer.json': () => import('../assets/106/demon/hamstrung-killer.json'),
  '106/demon/hamstrung-victim-hero.json': () => import('../assets/106/demon/hamstrung-victim-hero.json'),
  '106/warrok/special-skullcrack.json': () => import('../assets/106/warrok/special-skullcrack.json'),
  '106/warrok/special-whirlwind.json': () => import('../assets/106/warrok/special-whirlwind.json'),
  '106/warrok/special-groundslam.json': () => import('../assets/106/warrok/special-groundslam.json'),
  '106/warrok/special-lunge.json': () => import('../assets/106/warrok/special-lunge.json'),
  '106/warrok/execution-killer.json': () => import('../assets/106/warrok/execution-killer.json'),
  '106/warrok/execution-victim-hero.json': () => import('../assets/106/warrok/execution-victim-hero.json'),
  '106/warrok/hamstrung-killer.json': () => import('../assets/106/warrok/hamstrung-killer.json'),
  '106/warrok/hamstrung-victim-hero.json': () => import('../assets/106/warrok/hamstrung-victim-hero.json'),
  '106/brute/special-skullcrack.json': () => import('../assets/106/brute/special-skullcrack.json'),
  '106/brute/special-whirlwind.json': () => import('../assets/106/brute/special-whirlwind.json'),
  '106/brute/special-groundslam.json': () => import('../assets/106/brute/special-groundslam.json'),
  '106/brute/special-lunge.json': () => import('../assets/106/brute/special-lunge.json'),
  '106/brute/execution-killer.json': () => import('../assets/106/brute/execution-killer.json'),
  '106/brute/execution-victim-hero.json': () => import('../assets/106/brute/execution-victim-hero.json'),
  '106/brute/hamstrung-killer.json': () => import('../assets/106/brute/hamstrung-killer.json'),
  '106/brute/hamstrung-victim-hero.json': () => import('../assets/106/brute/hamstrung-victim-hero.json'),
};
/** The loader of `role`'s 106 clip for the 106 body file `body`, or undefined (no 106 version: the body plays what it would without it). */
export const clip106Loader = (body: string | undefined, role: string): Loader | undefined => {
  const path = clip106Path(body, role);
  return path ? CLIP_106_LOADERS[path] : undefined;
};
