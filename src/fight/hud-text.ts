// The words the fight HUD writes itself, as data (data/hud-text.json; src/fight/hud.ts reads it). Checked at load (validateFile 'hud-text'): a missing or blank word stops the page, not a fight.
import HUD_JSON from '../../data/hud-text.json' with { type: 'json' };
import { validateFile } from '../sim/validate.js';

export type HudText = {
  rematchTail: string; dummyNeverAttacks: string; zoneDied: string;
  stamina: Record<'plain' | 'exhaustedMobile' | 'woundMobile' | 'exhaustedAria' | 'woundAria', string>;
  attack: Record<'fight' | 'light' | 'mobileFight' | 'mobileSlash', string>;
  reset: Record<'playNow' | 'next' | 'rematch', string>;
};
const problems = validateFile('hud-text', HUD_JSON);
if (problems.length) throw Error(`data/hud-text.json: ${problems.join('; ')}`);
export const HUD_TEXT = HUD_JSON as unknown as HudText;
