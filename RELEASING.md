**English** · [Italiano](RELEASING.it.md)

# Releasing Scriba on npm

This guide explains how to publish the `@scriba-editor/*` packages. Publishing is an
**outward-facing action that cannot be undone**: a published version cannot be republished with
the same number. A person starts it by pushing a tag to GitHub; then the
`.github/workflows/release.yml` workflow checks, builds and publishes with _provenance_.

## Once only, before the first release

1. **npm organization.** On npmjs.com create the free organization **`scriba-editor`**, for
   public packages.

   > The `@scriba` scope belongs to another author, with packages published since 2023: that is
   > why the packages are named `@scriba-editor/*`. The product name stays Scriba.

2. **2FA** required for whoever publishes. It is an organization setting: "Require two-factor
   authentication".
3. **Token for the first release.** The packages do not exist yet, so the _Trusted Publisher_
   cannot be configured yet.
   - On npmjs.com create a **Granular Access Token**:
     - _Read and write_ permission on the `scriba-editor` organization;
     - short expiration (7 days);
     - if npm asks, the option to publish without interactive 2FA (CI cannot type the code).
   - On GitHub, in the repository: Settings ▸ Environments ▸ create the **`npm`** environment.
     - Add the **`NPM_TOKEN`** secret with the token.
     - If you want, add yourself to the _Required reviewers_: every release will wait for your
       approval.
4. **After the first release**, for each package, on npmjs.com: Settings ▸ Trusted Publisher ▸
   GitHub Actions, with these values:
   - user `mariotrombino76`;
   - repository `scriba`;
   - workflow `release.yml`;
   - environment `npm`.

   Then delete the token and the `NPM_TOKEN` secret: later releases authenticate with OIDC,
   without stored tokens.

   You can do it for all packages at once from the terminal (npm ≥ 11.15, after `npm login`, in
   a real terminal because 2FA in the browser is needed):

   ```bash
   npm trust github @scriba-editor/<name> --repo mariotrombino76/scriba --file release.yml \
     --env npm --allow-publish --yes
   ```

   Repeat it for each package with a 2-second pause; at the first 2FA choose "skip for 5
   minutes". Check: `npm trust list @scriba-editor/<name>`.

   > Done for 0.1.0 on 2026-11-16: all 51 packages have the Trusted Publisher and `release.yml`
   > no longer uses `NPM_TOKEN`.

5. **License.** `LICENSE` (Apache 2.0) and `NOTICE` (attribution to Mario Trombino) are in the
   root and in every package. npm only includes the files in the package folder: if they change,
   copy them again into all of them.

## At every release

### 1. Checks

CI (`.github/workflows/ci.yml`) runs the checks and the e2e tests in the three browsers on every
push. Before a release, check that the latest commit on `main` is green. Then, on an idle
machine, run:

```bash
pnpm bench         # compare with the previous release
pnpm test:perf     # same
pnpm audit         # development dependencies too
```

Also check that no new dependency has unreviewed install scripts.

### 2. Version

All packages ship with the **same version number**, following Semantic Versioning. While we are
at `0.x`, a minor version can contain breaking changes, flagged in the CHANGELOG.

```bash
pnpm -r exec npm version 0.1.0 --no-git-tag-version
```

In `CHANGELOG.md` move "Unreleased" under `## 0.1.0 — YYYY-MM-DD`, then commit:

```bash
git commit -am "chore(release): 0.1.0"
git push origin main && git push github main
```

### 3. Content check

```bash
pnpm build && pnpm -r pack --pack-destination /tmp/scriba-pack
```

Each archive must contain only `dist/` (or `scriba.css` for the themes), `package.json`, README,
LICENSE and NOTICE. The `workspace:*` dependencies must have become `0.1.0`. Never publish with
`npm publish` from a package folder: only `pnpm pack` replaces `workspace:*`. `release.yml`
publishes with `npm publish` the archive produced by `pnpm pack`.

### 4. Publishing

```bash
git tag v0.1.0
git push github v0.1.0
```

The tag starts `release.yml`, which:

1. checks that the tag matches the version of all packages;
2. runs lint, types, tests and security tests again;
3. builds the packages and publishes them one at a time (`pnpm pack`, then `npm publish` with
   `--provenance` and the Trusted Publisher's OIDC authentication), skipping those already
   published.

Push the tag to origin too (`git push origin v0.1.0`), so the two repositories stay the same.

### 5. Afterwards

- `npm view @scriba-editor/core@0.1.0`: the package page shows the "Provenance" badge.
- Try it in an empty project: `pnpm add @scriba-editor/react @scriba-editor/themes` and the
  README example.
- **CDN:** compute the hashes for the `integrity` attribute from the files served by jsDelivr
  (not from the local build) and update them, together with the version in the URLs, in the
  English files `README.md`, `docs/README.md`, `docs/getting-started.md` and
  `packages/browser/README.md`, and in their Italian counterparts `README.it.md`,
  `docs/it/README.md`, `docs/it/iniziare.md` and `packages/browser/README.it.md`:

  ```bash
  for f in scriba.iife.js scriba.css; do
    curl -sL "https://cdn.jsdelivr.net/npm/@scriba-editor/browser@0.1.0/dist/$f" \
      | openssl dgst -sha384 -binary | openssl base64 -A; echo "  $f"
  done
  ```

## If something goes wrong

- **The workflow fails before `publish`:** nothing has been released. Fix it, delete the tag
  (`git push github :v0.1.0` and `git tag -d v0.1.0`) and create it again.
- **The workflow fails halfway through publishing:** some packages have been released and others
  have not. Re-run the job (Re-run): the workflow skips the versions already present.
- **npm responds `429 Too Many Requests`:** npm limits how many _new_ packages are created in a
  short time (this happens on the first release). On GitHub: Actions ▸ Release ▸ Run workflow,
  branch `main`, version `0.1.0` and a pause between one package and the next (for example 5
  minutes). The workflow uses the code of the tag, skips the packages already published and, if a
  package fails, retries after 20 minutes (up to 4 times). If it still stops, run it again later.
- **A published version has a problem:** it is not deleted and not republished. Publish the next
  version with the fix and mark the faulty one with
  `npm deprecate @scriba-editor/<package>@<version> "reason"`.
- **Vulnerability:** follow `SECURITY.md`.
