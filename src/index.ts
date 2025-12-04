/**
 Copyright 2023 Forestry.io Holdings, Inc.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */
import {
  AbstractDatabaseOptions,
  AbstractIterator,
  AbstractKeyIterator,
  AbstractLevel,
  AbstractOpenOptions,
  AbstractValueIterator,
} from 'abstract-level'
import ModuleError from 'module-error'
import Database from 'better-sqlite3'

type NextCallback<K, V> =
  (err: Error | undefined | null, key?: K | undefined, value?: V | undefined) => void

export type SqliteLevelOptions<K, V> = {
  filename: string
  readOnly?: boolean
} & AbstractDatabaseOptions<K, V>

declare type BatchOperation = BatchPutOperation | BatchDelOperation

/**
 * A _put_ operation to be committed by a {@link SqliteLevel}.
 */
declare interface BatchPutOperation {
  /**
   * Type of operation.
   */
  type: 'put'

  /**
   * Key of the entry to be added to the database.
   */
  key: Buffer

  /**
   * Value of the entry to be added to the database.
   */
  value: Buffer
}

/**
 * A _del_ operation to be committed by a {@link SqliteLevel}.
 */
declare interface BatchDelOperation {
  /**
   * Type of operation.
   */
  type: 'del'

  /**
   * Key of the entry to be deleted from the database.
   */
  key: Buffer
}

declare interface IteratorOptions<KDefault> {
  limit?: number
  keyEncoding: string
  valueEncoding: string
  reverse: boolean
  keys: boolean
  values: boolean
  gt?: KDefault
  gte?: KDefault
  lt?: KDefault
  lte?: KDefault
}

const queryFromOptions = (options: IteratorOptions<any>) => {
  let query = 'SELECT key, value FROM kv'

  const params: unknown[] = []
  if (options.gt) {
    query += ` WHERE key > ?`
    params.push(options.gt)
  } else if (options.gte) {
    query += ` WHERE key >= ?`
    params.push(options.gte)
  }

  if (options.lt) {
    query += ` ${options.gt || options.gte ? 'AND' : 'WHERE'} key < ?`
    params.push(options.lt)
  } else if (options.lte) {
    query += ` ${options.gt || options.gte ? 'AND' : 'WHERE'} key <= ?`
    params.push(options.lte)
  }

  if (options.reverse) {
    query += ' ORDER BY key DESC'
  } else {
    query += ' ORDER BY key ASC'
  }

  if (options.limit) {
    query += ` LIMIT ?`
    params.push(options.limit)
  }

  return { query, params }

}
class SqliteIterator<KDefault, VDefault> extends AbstractIterator<
  SqliteLevel<KDefault, VDefault>,
  KDefault,
  VDefault
> {
  private iterator: IterableIterator<any>

  constructor(db: SqliteLevel<KDefault, VDefault>, options: IteratorOptions<KDefault>, client: Database.Database) {
    super(db, options)

    const { query, params } = queryFromOptions(options)
    const stmt = client.prepare(query)
    this.iterator = stmt.iterate(params)
  }

  async _next(callback: NextCallback<KDefault, VDefault>) {
    const result = this.iterator.next()
    if (!result.done) {
      return this.db.nextTick(callback, null, result.value.key, result.value.value)
    } else {
      return this.db.nextTick(callback, null, undefined, undefined)
    }
  }

  async _close(callback: (error?: Error) => void) {
    this.iterator.return?.()
    this.db.nextTick(callback)
  }
}
class SqliteKeyIterator<KDefault, VDefault> extends AbstractKeyIterator<
  SqliteLevel<KDefault, VDefault>,
  KDefault
> {
  private iterator: IterableIterator<any>

  constructor(db: SqliteLevel<KDefault, VDefault>, options: IteratorOptions<KDefault>, client: Database.Database) {
    super(db, options)

    const { query, params } = queryFromOptions(options)
    const stmt = client.prepare(query)
    this.iterator = stmt.iterate(params)
  }

  async _next(callback: NextCallback<KDefault, VDefault>) {
    const result = this.iterator.next()
    if (!result.done) {
      return this.db.nextTick(callback, null, result.value.key)
    } else {
      return this.db.nextTick(callback, null, undefined)
    }
  }

  async _close(callback: (error?: Error) => void) {
    this.iterator.return?.()
    this.db.nextTick(callback)
  }
}
class SqliteValueIterator<KDefault, VDefault> extends AbstractValueIterator<
  SqliteLevel<KDefault, VDefault>,
  KDefault,
  VDefault
> {
  private iterator: IterableIterator<any>

  constructor(db: SqliteLevel<KDefault, VDefault>, options: IteratorOptions<KDefault>, client: Database.Database) {
    super(db, options)

    const { query, params } = queryFromOptions(options)
    const stmt = client.prepare(query)
    this.iterator = stmt.iterate(params)
  }

  async _next(callback: NextCallback<KDefault, VDefault>) {
    const result = this.iterator.next()
    if (!result.done) {
      return this.db.nextTick(callback, null, result.value.value)
    } else {
      return this.db.nextTick(callback, null, undefined)
    }
  }

  async _close(callback: (error?: Error) => void) {
    this.iterator.return?.()
    this.db.nextTick(callback)
  }
}

export class SqliteLevel<KDefault = string, VDefault = string> extends AbstractLevel<Buffer | Uint8Array | string, KDefault, VDefault> {
  public db: Database.Database
  private readOnly: boolean = false

  constructor(options: SqliteLevelOptions<KDefault, VDefault>) {
    const encodings = { utf8: true }
    super({ encodings}, options)
    this.db = new Database(options.filename)
    this.db.pragma('journal_mode = WAL')
    if (options.readOnly !== undefined) {
      this.readOnly = options.readOnly
    }
  }

  get type() {
    return 'sqlite3'
  }

  async _open(options: AbstractOpenOptions, callback: (error?: Error) => void) {
    this.db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT UNIQUE, value TEXT)')
    this.nextTick(callback)
  }

  async _close(callback: (error?: Error) => void) {
    this.db.close()
    this.nextTick(callback)
  }

  async _get(key: Buffer, options: any, callback: (error?: Error, value?: Buffer) => void) {
    const stmt = this.db.prepare('SELECT value FROM kv WHERE key = ?')
    const row = stmt.get(key.toString()) as any
    if (row) {
      return this.nextTick(callback, null, row.value)
    } else {
      return this.nextTick(
        callback,
        new ModuleError(`Key ${key} was not found`, {
          code: 'LEVEL_NOT_FOUND',
        })
      )
    }
  }

  async _put(key: Buffer, value: Buffer, options: any, callback: (error?: Error) => void) {
    if (this.readOnly) {
      return this.nextTick(
        callback,
        new ModuleError('not authorized to write to branch', {
          code: 'LEVEL_READ_ONLY',
        })
      )
    }
    const stmt = this.db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    stmt.run(key.toString(), value.toString())
    this.nextTick(callback)
  }

  async _del(key: Buffer, options: any, callback: (error?: Error) => void) {
    if (this.readOnly) {
      return this.nextTick(
        callback,
        new ModuleError('not authorized to write to branch', {
          code: 'LEVEL_READ_ONLY',
        })
      )
    }
    const stmt = this.db.prepare('DELETE FROM kv WHERE key = ?')
    stmt.run(key.toString())
    this.nextTick(callback)
  }

  async _batch(batch: BatchOperation[], options: any, callback: (error?: Error) => void): Promise<void> {
    if (this.readOnly) {
      return this.nextTick(
        callback,
        new ModuleError('not authorized to write to branch', {
          code: 'LEVEL_READ_ONLY',
        })
      )
    }

    const putStmt = this.db.prepare(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    )
    const delStmt = this.db.prepare('DELETE FROM kv WHERE key = ?')

    const runBatch = this.db.transaction((ops: BatchOperation[]) => {
      for (const op of ops) {
        if (op.type === 'put') {
          putStmt.run(op.key.toString(), op.value.toString())
        } else if (op.type === 'del') {
          delStmt.run(op.key.toString())
        }
      }
    })

    runBatch(batch)
    this.nextTick(callback)
  }

  async _clear(options: any, callback: (error?: Error) => void): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM kv WHERE key LIKE ? || \'%\'')
    stmt.run(options.gte)
    this.nextTick(callback)
  }

  _iterator(
    options: IteratorOptions<KDefault>
  ): SqliteIterator<KDefault, VDefault> {
    return new SqliteIterator<KDefault, VDefault>(this, options,
      this.db,
    )
  }

  _keys(
    options: IteratorOptions<KDefault>
  ): SqliteKeyIterator<KDefault, VDefault> {
    return new SqliteKeyIterator<KDefault, VDefault>(this, options, this.db )
  }

  _values(
    options: IteratorOptions<KDefault>
  ): SqliteValueIterator<KDefault, VDefault> {
    return new SqliteValueIterator<KDefault, VDefault>(this, options, this.db )
  }
}
