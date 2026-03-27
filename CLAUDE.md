# aptunnel — Claude Instructions

## Release process (ALWAYS follow when pushing code changes)

Every time code is committed and pushed to main, determine whether the change
warrants a version bump. Use these rules:

| Change type | Version bump | Example |
|---|---|---|
| Bug fix | patch: `1.0.0 → 1.0.1` | fix a crash, correct output |
| New feature (backwards-compatible) | minor: `1.0.0 → 1.1.0` | new command, new option |
| Breaking change | major: `1.0.0 → 2.0.0` | renamed command, removed flag |
| CI/docs/test only | none | workflow fix, README update |

### Steps to follow on every code push

1. **Update `package.json` version** if the change warrants a bump (see table above).
2. **Commit** all changes (including the version bump) in a single commit.
   - Commit author: always `biyro02` (the configured git user) — do NOT add `Co-Authored-By` lines.
3. **Push** to `main`.
4. **If version was bumped**: create and push a matching git tag so CI publishes to npm automatically:
   ```
   git tag v<new-version>
   git push origin v<new-version>
   ```
   Example: after bumping to `1.0.1` → `git tag v1.0.1 && git push origin v1.0.1`

CI will then run all tests (9 combinations: 3 OS × 3 Node versions) and publish
to npm automatically if everything passes.

### What NOT to do
- Never push a tag without first pushing the matching commit to main.
- Never bump the version for CI-only, doc-only, or test-only changes.
- Never manually run `npm publish` — let CI handle it via the tag.

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
