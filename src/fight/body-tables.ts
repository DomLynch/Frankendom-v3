// The bodytype and species tables a catalogue row's `wounds` reads (World's #2000 schema, K5): what can be hurt on a body family, and how a species bleeds. GENERATED once by
// scripts/catalogue-convert.mjs (the bone names are the skin joints of the GLBs, read, not typed); this file is the source of truth from here on. A new body family is one entry, a new
// creature is a `wounds` row. The trunk is the root part; a head hangs from the neck and the neck from the trunk, so severing the neck takes the head. Data only: no engine reads it yet.
import type { Bodytype, Species } from './catalogue.ts';

export const BODYTYPES: Readonly<Record<string, Bodytype>> = { quadruped: { parts: [
    { id: "head", bones: ["head", "jaw"], vital: true, weight: 2, cuttable: true, parent: "neck" },
    { id: "neck", bones: ["neck"], vital: true, weight: 1, cuttable: true, parent: "torso" },
    { id: "torso", bones: ["spine2"], vital: true, weight: 5, cuttable: false },
    { id: "foreL", bones: ["front_up_L"], vital: false, weight: 1, cuttable: true, parent: "torso" },
    { id: "foreR", bones: ["front_up_R"], vital: false, weight: 1, cuttable: true, parent: "torso" },
    { id: "hindL", bones: ["hind_up_L"], vital: false, weight: 1, cuttable: true, parent: "torso" },
    { id: "hindR", bones: ["hind_up_R"], vital: false, weight: 1, cuttable: true, parent: "torso" },
  ] } };
export const SPECIES: Readonly<Record<string, Species>> = { beast: { blood: { start: "#5a0b0a", end: "#1c0403" }, decal: { id: "blood-splat", sizeM: 0.5 }, spray: 1 } };
