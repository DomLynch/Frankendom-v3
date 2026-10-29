// A weapon shape the table names but the build does not ship (the executioner's scythe under ?bossweapon=v1: scythe-plain) must not be fetched:
// that was a 404 and a console error at page load. The shipped list is pinned to public/weapons/shapes/; files that ship are still asked for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { SHIPPED_SHAPES, SHIPPING_SHAPES, shapeFor, shippedShape } from '../src/fight/weapon-shapes.ts';

test('the shipped list is exactly the .glb files under public/weapons/shapes/', () => {
  const files = readdirSync(new URL('../public/weapons/shapes/', import.meta.url)).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).sort();
  assert.deepEqual([...SHIPPED_SHAPES].sort(), files);
});
test('the V1 scythe (not shipped) is not fetched; shipped files still are', () => {
  const scythe = shapeFor('scythe', 1, SHIPPING_SHAPES, 'executioner');
  assert.match(scythe, /scythe-plain\.glb$/);
  assert.equal(shippedShape(scythe), false);
  for (const w of ['cleaver', 'gladius', 'longsword']) assert.equal(shippedShape(shapeFor(w, 1, SHIPPING_SHAPES)), true, w);
});
test('the BUILT url carries a content hash: shipped files are still asked for (the hero sword vanished on live when #218 compared the hashed name)', () => {
  for (const w of ['cleaver', 'gladius', 'longsword']) {
    const built = shapeFor(w, 1, SHIPPING_SHAPES).replace(/\.glb$/, '.a3defee2.glb');
    assert.equal(shippedShape(built), true, `${w} ${built}`);
    assert.equal(shippedShape(`${built}?v=1`), true, `${w} with a query`);
  }
  assert.equal(shippedShape('/weapons/shapes/scythe-plain.a3defee2.glb'), false);
});
