# Install

```
npm ci
```

Needs Node 22+ and network access to three hosts: `registry.npmjs.org`, `github.com`, `codeload.github.com`.

## The physics dependency

`@frankendom/physics` is not on the npm registry. `package.json` and `package-lock.json` pin it to a GitHub tarball at one full commit sha:

```
https://codeload.github.com/DomLynch/physics/tar.gz/<40-char sha>
```

- `DomLynch/physics` is public. The tarball needs no token or secret. `npm ci` from a clean clone works on the Mac, in GitHub Actions and in the Hugging Face job (`scripts/hf-job.sh`) with no credentials.
- The lockfile carries a sha512 integrity hash for the tarball, so a changed download fails the install.
- Physics Dev owns the pin. A bump changes `package.json` and `package-lock.json` together, in a physics pin PR.

## Sandboxes with an egress allow-list

`codeload.github.com` is a different host from `github.com` and the npm registry. A sandbox that allows only those two fails `npm ci` at the physics tarball (audit item 22). Fix: allow `codeload.github.com`. No repo change is needed.

Last resort without that host: clone `https://github.com/DomLynch/physics.git`, check out the sha from `package.json`, and install that folder into `node_modules/@frankendom/physics` by hand (this skips the lockfile integrity check, so use it for audits only, never for a release build).
