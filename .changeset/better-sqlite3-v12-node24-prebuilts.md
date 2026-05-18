---
"sqlite-level": minor
---

Bump `better-sqlite3` from `^11.8.1` to `^12.9.0` so consumers pick up Node-24 (`NODE_MODULE_VERSION 137`) prebuilt binaries. The `better-sqlite3` v11.x line tops out at Node 23 prebuilts (`node-v131`), so a fresh `npm install` on Node 24 falls back to `node-gyp rebuild` and fails without a local Python + C++ toolchain (see [tinacms/tinacms#6686](https://github.com/tinacms/tinacms/issues/6686)). `better-sqlite3@12` adds Node 24 to its build matrix and drops EOL Node 18 — no API changes affect `SqliteLevel`'s usage of `Database`, `prepare`, `exec`, or `iterate`.

Picks up the work in [#25](https://github.com/tinacms/sqlite-level/pull/25) (closed unmerged), now rebased onto the post-ESM v2.0.0 main.
