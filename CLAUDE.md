# aptunnel — Claude Instructions

## Release process (ALWAYS follow when pushing code changes)

Every time code is committed and pushed to main, determine whether the change
warrants a version bump. Use these rules:

| Change type | Version bump | Patch reset? | Example |
|---|---|---|---|
| Bug fix | patch: `1.0.0 → 1.0.1` | — | fix a crash, correct output |
| New feature (backwards-compatible) | minor: `1.0.0 → 1.1.0` | **yes, patch → 0** | new command, new option |
| Breaking change | major: `1.0.0 → 2.0.0` | yes, minor+patch → 0 | renamed command, removed flag |
| CI/docs/test only | none | — | workflow fix, README update |

**Semver rule:** when the minor version increases, patch resets to 0 (`1.0.5 → 1.1.0`, not `1.1.5`).
When the major version increases, both minor and patch reset to 0 (`1.2.3 → 2.0.0`).

### Steps to follow on every code push

1. **Update `package.json` version** FIRST if the change warrants a bump (see table above).
   - CRITICAL: The version in `package.json` MUST match the git tag. Always bump
     the version in the same commit as the code change, never after.
2. **Update `CHANGELOG.md`** — add a new `## [x.y.z] — YYYY-MM-DD` section at the top with
   a concise bullet list of what changed. This is **mandatory** for every versioned release.
3. **Commit** all changes (code + version bump + CHANGELOG) in a single commit.
   - Commit author: always `biyro02` (the configured git user) — do NOT add `Co-Authored-By` lines.
   - Write a clear, user-facing commit message — it becomes the GitHub release notes.
3. **Push** to `main`.
4. **If version was bumped**: create a GitHub release (not just a tag) so npm CI publishes
   and release notes are visible on GitHub. Extract the release notes from CHANGELOG.md
   (the section for the new version) — do NOT use the raw commit message body.
   ```
   git tag v<new-version>
   git push origin v<new-version>
   # Extract the new version's section from CHANGELOG.md and use as release notes:
   gh release create v<new-version> --title "v<new-version>" --notes "$(awk '/^## \[<new-version>\]/{found=1; next} found && /^## \[/{exit} found{print}' CHANGELOG.md | sed '/^[[:space:]]*$/d' | head -50)"
   ```
   Example: bumping to `1.1.0`:
   - Update package.json → `"version": "1.1.0"`
   - Add `## [1.1.0] — YYYY-MM-DD` section to CHANGELOG.md
   - `git add . && git commit -m "feat: add dbs command and env selection improvements"`
   - `git push origin main`
   - `git tag v1.1.0 && git push origin v1.1.0`
   - `gh release create v1.1.0 --title "v1.1.0" --notes "$(awk '/^## \[1\.1\.0\]/{found=1; next} found && /^## \[/{exit} found{print}' CHANGELOG.md)"`

CI will then run all tests (9 combinations: 3 OS × 3 Node versions) and publish
to npm automatically if everything passes.

### What NOT to do
- Never push a tag without first pushing the matching commit to main.
- Never bump the version for CI-only, doc-only, or test-only changes.
- Never manually run `npm publish` — let CI handle it via the tag.
- Never create a GitHub release before the tag is pushed.

## Accounts & references
- GitHub org: Uruba-Software (owner: biyro02)
- GitHub repo: https://github.com/Uruba-Software/aptunnel
- npm package: https://www.npmjs.com/package/aptunnel
- npm publisher account: buluad
- npm token type: Granular Access Token, no 2FA required — stored as `NPM_TOKEN` in GitHub repo secrets
- Default branch: `main`
- CI: GitHub Actions (`.github/workflows/test.yml`)

## Key technical decisions & gotchas
- `shell: true` required on Windows for all `spawn`/`spawnSync('aptible', ...)` calls — `.cmd` files need a shell
- `pathToFileURL()` required in `bin/aptunnel.js` for Windows ESM compatibility (drive paths like `D:\...` are invalid import specifiers)
- `wmic` is removed in modern Windows — use `tasklist` for process info, PowerShell for uptime
- `import.meta.dirname` only available in Node 22+ — use `fileURLToPath(import.meta.url)` for compatibility
- `node --test` in Node 22 cannot resolve directory paths — always use explicit file list in test scripts
- `timeout.exe` exits without a TTY on Windows CI — use `process.execPath` with `setTimeout` for cross-platform long-running test processes
- Tunnel cleanup on Windows: `taskkill /F /T /PID` to kill entire process tree (otherwise log file lock prevents temp dir deletion)

## Project overview
Cross-platform Node.js CLI that wraps the Aptible CLI for multi-tunnel
management. Users install it globally: `npm install -g aptunnel`.

- Runtime: Node.js ≥ 18, ESM (`"type": "module"`)
- Dependencies: chalk, js-yaml, ora
- Config file: `~/.aptunnel/config.yaml` (overridable via `APTUNNEL_CONFIG_HOME`)
- Temp/PID files: system tmpdir (overridable via `APTUNNEL_TEMP_DIR`)
- Tests: `node:test` built-in, no external test framework
