// The M7 fight-feel chunk: every ?feel=<name> module's code and rows in ONE separate, content-hashed module (b/vendor/feel.<hash>.js, scripts/build.mjs), fetched by feel.ts only when the
// link asks for a feel, so a first visit adds nothing to main.js (V3 Dev, 2026-10-27: clash alone was 17 KB of source + 5 KB of JSON in main.js). A module exports its hooks as `feelHooks`
// (no registerFeel here: this chunk is a second bundle and has its own copy of anything it imports, so it must import only TYPES from feel.ts) and is listed below under its ?feel= name,
// and in FEEL_NAMES (feel-modules.ts), one line each.
export { feelHooks as clash } from './feel-clash.ts';
export { feelHooks as kick } from './feel-kick.ts';
