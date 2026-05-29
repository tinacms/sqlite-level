---
"sqlite-level": patch
---

Fix `SqliteError: ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint` when opening a database originally created by sqlite-level <2.0.0.

Pre-2.0 created the `kv` table as `(key TEXT, value TEXT)` with no UNIQUE constraint and inserted with a plain `INSERT INTO kv …`. Since 2.0 the inserts use `INSERT … ON CONFLICT(key) DO UPDATE`, which SQLite rejects unless `key` is UNIQUE — so opening a pre-2.0 file with 2.0+ threw on the first put/batch/clear, taking down whoever was awaiting the rejection.

`_open()` now detects a missing UNIQUE index on `key`, deduplicates any rows that share a key (last write wins — pre-2.0 `_get` returned the first matching row, but on disk the last INSERT is the most recently written value, matching 2.0+ upsert semantics), and adds the UNIQUE index. The check is idempotent: files created by 2.0+ already have the column-level UNIQUE autoindex, so the migration short-circuits at the detection query.

The migration is skipped entirely when the database is opened with `readOnly: true`, runs inside a `BEGIN IMMEDIATE` transaction with `CREATE UNIQUE INDEX IF NOT EXISTS` so concurrent opens of the same legacy file serialise cleanly, and ignores partial unique indexes (which don't satisfy `ON CONFLICT(key)`).
