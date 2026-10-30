// Audit 5: src/fight/rig-bones.ts `bone` caches each lookup per rig root (a Map name -> node), so the per-frame bone reads stop running a recursive
// getObjectByName search. This pins: same object back, one search then hits, rebuilt on a rig change, no stale bone after the rig is taken apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object3D } from 'three';
import { bone, boneLookups, clearBoneCache, sanitizeNodeName } from '../src/fight/rig-bones.ts';

const RIG = JSON.parse((await import('node:fs')).readFileSync(new URL('../data/rig.json', import.meta.url), 'utf8'));
const HIPS = sanitizeNodeName(RIG.detect['106']), HAND = sanitizeNodeName(RIG.bones.hand_r);
const named = (name) => { const o = new Object3D(); o.name = name; return o; };
// A minimal 106 body: root > hips > spine > hand.
const body = () => { const root = named('Root'), hips = named(HIPS), hand = named(HAND); root.add(hips); hips.add(named('Spine')); hips.children[0].add(hand); return { root, hips, hand }; };

test('the same bone object comes back, found by one search then served from the cache', () => {
  const { root, hand } = body();
  assert.equal(bone(root, 'hand_r'), hand);
  const searches = boneLookups.searches, hits = boneLookups.hits;
  for (let i = 0; i < 50; i++) assert.equal(bone(root, 'hand_r'), hand);
  assert.equal(boneLookups.searches, searches, 'no further recursive search');
  assert.equal(boneLookups.hits, hits + 50);
});

test('a different rig root is its own cache: a rig swap rebuilds it and never returns the old rig bone', () => {
  const a = body(), b = body();
  assert.equal(bone(a.root, 'hand_r'), a.hand);
  assert.equal(bone(b.root, 'hand_r'), b.hand);
  assert.notEqual(bone(b.root, 'hand_r'), a.hand);
  clearBoneCache(a.root);
  const searches = boneLookups.searches;
  assert.equal(bone(a.root, 'hand_r'), a.hand);
  assert.equal(boneLookups.searches, searches + 1, 'cleared cache searches again');
});

test('no stale bone after dispose or re-parent: a detached bone is not served, the live one is found again', () => {
  const { root, hips, hand } = body();
  assert.equal(bone(root, 'hand_r'), hand);
  hand.removeFromParent();
  assert.equal(bone(root, 'hand_r'), undefined, 'removed bone is gone, not a stale hit');
  const fresh = named(HAND); hips.add(fresh);
  assert.equal(bone(root, 'hand_r'), fresh, 'a bone that arrives later is found (misses are never cached)');
  hips.removeFromParent(); root.clear();
  assert.equal(bone(root, 'hand_r'), undefined, 'after the rig is taken apart nothing stale remains');
});
