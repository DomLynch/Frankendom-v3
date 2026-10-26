// Gate 0: extracts V1's fight sim at the pinned seed tag into .gate0/v1 (gitignored), so the replay diff runs against V1's own code
// without vendoring it. Idempotent: a stamp file holds the tag's tree id; a matching stamp skips the extract.
// CI fetches the tag first (the default checkout is shallow and tagless): see .github/workflows/ci.yml.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const TAG = 'v1-seed-82a994d15';
export const PATHS = ['src/fight', 'src/core/registry.ts', 'src/roster.ts'];
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const V1_DIR = join(ROOT, '.gate0', 'v1');

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

export function extractV1() {
  let tree;
  try { tree = git('rev-parse', `${TAG}^{tree}`); } catch {
    throw new Error(`gate0: tag ${TAG} is not in this checkout. Fetch it: git fetch --no-tags --depth=1 origin refs/tags/${TAG}:refs/tags/${TAG}`);
  }
  const stamp = join(V1_DIR, '.tree');
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === tree) return V1_DIR;
  rmSync(V1_DIR, { recursive: true, force: true });
  mkdirSync(V1_DIR, { recursive: true });
  const tar = execFileSync('git', ['archive', '--format=tar', TAG, ...PATHS], { cwd: ROOT, maxBuffer: 1 << 28 });
  execFileSync('tar', ['-x', '-C', V1_DIR], { input: tar, maxBuffer: 1 << 28 });
  writeFileSync(stamp, tree);
  return V1_DIR;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(extractV1());
