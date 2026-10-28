# Cut batch receipt

Rows: rows-scratch.json (1 bodies). Tool: physics ba2daea. Sources: srcs.

| body | rig | result | structure | watertight | orientation | weights | bone_side | caps | conservation | planes | sha256 of the cut GLB |
|---|---|---|---|---|---|---|---|---|---|---|---|
| the-boss-106 | mixamo-106 | **PASS** | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 367554e5baddc5e921e9ba007ced91b7b9def499818d29a4cfb0d85d6ef2404a |

## the-boss-106: PASS

Source the-boss-106.glb sha256 1fb54cf41b0702fa778f512346be53489829cc6b97d42bdebcffd7eccd9a22f7

- measure: ok true, committed same joints, height_m 1.7367
- source: plain decompressed, file the-boss-106.source-plain.glb, sha256 e7e2c65e82cdbd4a557a51ec48dafff5bd21bb1eb93b0d959798e36622bbe54d
- cut: ok true, vertices 12891 -> 14524, triangles 24032 -> 25876, open_edges_at_cuts 0, open_edges_native 226, notes none
- structure: PASS  schema cut-pieces/1, 7 pieces + 12 caps, one skin (106 joints), skeleton matches source
- watertight: PASS  every piece with its caps is closed except 226 edge(s) native to the source (226 open, 0 over-used); none introduced
- orientation: PASS  winding is consistent across every shared edge
- weights: PASS  all weights sum to 1 (within 0.001), finite, at most 4 joints, 19 meshes
- bone_side: PASS  no vertex is bound to a bone on the other side of a cut
- caps: PASS  caps face outward, winding agrees with normals, UVs present
- conservation: PASS  area 7.4055 vs 7.4055 (0.000 percent), bounding box equal, 12197 source vertices all present
- planes: PASS  every piece vertex is on its side of its planes (1e-4); plane_exempt (manifest): 1025 piece_root vertices (Clothes_MAT.001.rigid); 1091 piece_upper_torso vertices (Clothes_MAT) not checked

RESULT: OK (1 pass, 0 blocked)
