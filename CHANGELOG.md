# sqlite-level

## 2.1.1

### Patch Changes

- efbb7cc: Refresh devDependencies to latest minor/patch lines: `@changesets/cli` (2.27.8 → 2.31.0), `@types/better-sqlite3` (^7.6.12 → ^7.6.13), `typedoc` (^0.28.15 → ^0.28.19), `typescript` (^5.7.3 → ^5.9.3). Vitest left at v2.x deliberately — bumping to v4 has breaking changes worth treating as a separate effort.
- 0cca415: Fix `SqliteError: ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint` when opening a database originally created by sqlite-level <2.0.0.

  Pre-2.0 created the `kv` table as `(key TEXT, value TEXT)` with no UNIQUE constraint and inserted with a plain `INSERT INTO kv …`. Since 2.0 the inserts use `INSERT … ON CONFLICT(key) DO UPDATE`, which SQLite rejects unless `key` is UNIQUE — so opening a pre-2.0 file with 2.0+ threw on the first put/batch/clear, taking down whoever was awaiting the rejection.

  `_open()` now detects a missing UNIQUE index on `key`, deduplicates any rows that share a key (last write wins — pre-2.0 `_get` returned the first matching row, but on disk the last INSERT is the most recently written value, matching 2.0+ upsert semantics), and adds the UNIQUE index. The check is idempotent: files created by 2.0+ already have the column-level UNIQUE autoindex, so the migration short-circuits at the detection query.

  The migration is skipped entirely when the database is opened with `readOnly: true`, runs inside a `BEGIN IMMEDIATE` transaction with `CREATE UNIQUE INDEX IF NOT EXISTS` so concurrent opens of the same legacy file serialise cleanly, and ignores partial unique indexes (which don't satisfy `ON CONFLICT(key)`).

## 2.1.0

### Minor Changes

- 06e0c9d: Bump `better-sqlite3` from `^11.8.1` to `^12.10.0` so consumers pick up Node-24 (`NODE_MODULE_VERSION 137`) prebuilt binaries. The `better-sqlite3` v11.x line tops out at Node 23 prebuilts (`node-v131`), so a fresh `npm install` on Node 24 falls back to `node-gyp rebuild` and fails without a local Python + C++ toolchain (see [tinacms/tinacms#6686](https://github.com/tinacms/tinacms/issues/6686)). `better-sqlite3@12` adds Node 24 to its build matrix and drops EOL Node 18 — no API changes affect `SqliteLevel`'s usage of `Database`, `prepare`, `exec`, or `iterate`.

  **Platform-support narrowing — please read if you're on Node 20 or 23:**

  This caret pin (`^12.10.0`) resolves to `better-sqlite3@12.10.0`, whose [release notes](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.10.0) call out: _"Add support for Node.js v26 prebuilds and remove EOL builds (Node.js v20, v23)"_. So the prebuild matrix is now **Node 22, 24, 25, 26** only. Consumers on:

  - **Node 20** (LTS — reached EOL 2026-04-30): install will fall back to `node-gyp rebuild` and require a local Python + C++ toolchain. Same failure mode this PR fixes for Node 24, just on a different Node major. Upgrading to Node 22 LTS is the recommended path.
  - **Node 23** (non-LTS, EOL 2025-06-01): same install failure.
  - **Node 18** (EOL 2025-04-30): unchanged — better-sqlite3 v12 dropped Node 18 in its `engines` field. Was already not picking up Node 18 prebuilds.

  Tina-first-party consumers (TinaCloud content-api, TinaCMS's `@tinacms/search`, the `tina-self-hosted-demo` example) all target Node 22+ and are unaffected.

  Picks up the work in [#25](https://github.com/tinacms/sqlite-level/pull/25) (closed unmerged), now rebased onto the post-ESM v2.0.0 main.

## 2.0.0

### Major Changes

- 37f893e: feat: remove cjs support, move to esm

## 1.2.1

### Patch Changes

- 3e85afc: ⬆️ chore: update dependencies and devDependencies in package.json

## 1.2.0

### Minor Changes

- 1d53318: Upgrade dependendices (especially sqlite) to latest version

## 1.0.1

### Patch Changes

- baef9e4: Cleanup
- 0568307: Initial publish
- 581c4ac: Update to latest better-sqlite3
- e2ec2e1: Bump to test changesets
