// Touch ownership: which control a finger belongs to, decided at pointerdown, so a touch that starts on a
// button, the joystick or a panel never turns into a camera drag when it drifts over the arena. Pure and DOM-free: the page hands in
// what it knows about the target. Ported from levy-street/world-of-claudecraft src/game/touch_router.ts @f46f30f, MIT:
//   Copyright (c) 2026 Levy Street. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
//   associated documentation files, to deal in the Software without restriction, subject to the above copyright notice and this
//   permission notice being included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT
//   WARRANTY OF ANY KIND. (Full text: https://github.com/levy-street/world-of-claudecraft/blob/f46f30f/LICENSE)
// Frankendom's selectors and owners only (no ground-aim owner: the fight has no ground targeting). It changes no combat input: the buttons
// and the joystick keep their own handlers (input.ts); this only gates the arena's camera drag (main.ts) and the page's zoom guards stay as they are.
export type TouchOwner = 'movement' | 'combatButton' | 'camera' | 'menu' | 'ignored';

/** The part of a DOM element the router reads: real Elements and a test fake both fit. */
export interface TouchTarget { closest(selector: string): TouchTarget | null }

export interface TouchContext {
  /** A dialog, the welcome card or another full-screen layer is up: it takes every touch. */
  menuOpen: boolean;
  isMovementZone(target: TouchTarget | null): boolean;
  isCameraSurface(target: TouchTarget | null): boolean;
}

/** Anything the player taps that is not the arena: the action cluster and its buttons, the end-screen buttons and panels, the header. */
export const INTERACTIVE_SELECTORS = ['#actions', '#joystick', '#reset-button', '.share-button', '#camera-button', '#recenter-button', '.loot-panel', '.loot-panel-actions', '#journal', 'header'] as const;

export const isInteractiveHud = (target: TouchTarget | null): boolean => !!target && INTERACTIVE_SELECTORS.some((selector) => target.closest(selector));

/** Priority: an open menu, then the joystick, then a HUD control, then the arena (camera). Anything else is ignored. */
export function getTouchOwner(target: TouchTarget | null, ctx: TouchContext): TouchOwner {
  if (ctx.menuOpen) return 'menu';
  if (ctx.isMovementZone(target)) return 'movement';
  if (isInteractiveHud(target)) return 'combatButton';
  return ctx.isCameraSurface(target) ? 'camera' : 'ignored';
}
