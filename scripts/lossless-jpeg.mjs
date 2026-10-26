// Recode JPEG entropy/scans without changing DCT coefficients or source files.
// jpegtran is a build tool only; the browser receives ordinary JPEG textures.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const cache = new Map();
export function losslessJpeg(bytes) {
  const key = createHash('sha256').update(bytes).digest('hex');
  if (cache.has(key)) return cache.get(key);
  let best = bytes, size = gzipSync(bytes).length;
  // The input goes in as a FILE, not a stdin pipe: deploy #71 (2026-09-22) sat for an hour on a jpegtran that was asleep with only
  // the stdin socket open, inside a release check's vite build, and nothing ever timed it out. One pipe (stdout) and a hard timeout
  // turn that class of wedge into a loud failure within a minute.
  const dir = mkdtempSync(join(tmpdir(), 'frankendom-jpegtran-')), input = join(dir, 'in.jpg');
  try {
    writeFileSync(input, bytes);
    for (const flags of [[], ['-progressive']]) {
      let candidate;
      try {
        candidate = execFileSync('jpegtran', ['-copy', 'all', '-optimize', ...flags, input], { maxBuffer: 32e6, timeout: 60_000, killSignal: 'SIGKILL' });
      } catch (cause) {
        throw new Error('Lossless texture packing requires jpegtran (brew install jpeg-turbo, or apt install libjpeg-turbo-progs); a run over 60 s is killed', { cause });
      }
      const packed = gzipSync(candidate).length;
      if (packed < size) { best = candidate; size = packed; }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  cache.set(key, best);
  return best;
}
