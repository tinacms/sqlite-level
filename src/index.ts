import {
  type AbstractDatabaseOptions,
  AbstractIterator,
  AbstractKeyIterator,
  AbstractLevel,
  type AbstractOpenOptions,
  AbstractValueIterator,
} from "abstract-level";
import ModuleError from "module-error";
import Database from "better-sqlite3";

export type SqliteLevelOptions<K, V> = {
  filename: string;
  readOnly?: boolean;
} & AbstractDatabaseOptions<K, V>;

declare type BatchOperation = BatchPutOperation | BatchDelOperation;

/**
 * A _put_ operation to be committed by a {@link SqliteLevel}.
 */
declare interface BatchPutOperation {
  /**
   * Type of operation.
   */
  type: "put";

  /**
   * Key of the entry to be added to the database.
   */
  key: Buffer;

  /**
   * Value of the entry to be added to the database.
   */
  value: Buffer;
}

/**
 * A _del_ operation to be committed by a {@link SqliteLevel}.
 */
declare interface BatchDelOperation {
  /**
   * Type of operation.
   */
  type: "del";

  /**
   * Key of the entry to be deleted from the database.
   */
  key: Buffer;
}

declare interface IteratorOptions<KDefault> {
  limit?: number;
  keyEncoding: string;
  valueEncoding: string;
  reverse: boolean;
  keys: boolean;
  values: boolean;
  gt?: KDefault;
  gte?: KDefault;
  lt?: KDefault;
  lte?: KDefault;
}

const queryFromOptions = (options: IteratorOptions<any>) => {
  let query = "SELECT key, value FROM kv";

  const params = [];
  if (options.gt) {
    query += " WHERE key > ?";
    params.push(options.gt);
  } else if (options.gte) {
    query += " WHERE key >= ?";
    params.push(options.gte);
  }

  if (options.lt) {
    query += ` ${options.gt || options.gte ? "AND" : "WHERE"} key < ?`;
    params.push(options.lt);
  } else if (options.lte) {
    query += ` ${options.gt || options.gte ? "AND" : "WHERE"} key <= ?`;
    params.push(options.lte);
  }

  if (options.reverse) {
    query += " ORDER BY key DESC";
  } else {
    query += " ORDER BY key ASC";
  }

  if (options.limit) {
    query += ` LIMIT ${options.limit}`;
  }

  return { query, params };
};
class SqliteIterator<KDefault, VDefault> extends AbstractIterator<
  SqliteLevel<KDefault, VDefault>,
  KDefault,
  VDefault
> {
  private client: any;
  private iterator: IterableIterator<any>;

  constructor(
    db: SqliteLevel<KDefault, VDefault>,
    options: IteratorOptions<KDefault>,
    client: any
  ) {
    super(db, options);
    this.client = client;

    const { query, params } = queryFromOptions(options);
    const stmt = this.client.prepare(query);
    this.iterator = stmt.iterate(params);
  }

  async _next(): Promise<[KDefault, VDefault] | undefined> {
    const result = this.iterator.next();
    if (!result.done) {
      return [result.value.key, result.value.value];
    }
    return undefined;
  }
}

class SqliteKeyIterator<KDefault, VDefault> extends AbstractKeyIterator<
  SqliteLevel<KDefault, VDefault>,
  KDefault
> {
  private client: any;
  private iterator: IterableIterator<any>;

  constructor(
    db: SqliteLevel<KDefault, VDefault>,
    options: IteratorOptions<KDefault>,
    client: any
  ) {
    super(db, options);
    this.client = client;

    const { query, params } = queryFromOptions(options);
    const stmt = this.client.prepare(query);
    this.iterator = stmt.iterate(params);
  }

  async _next(): Promise<KDefault | undefined> {
    const result = this.iterator.next();
    if (!result.done) {
      return result.value.key;
    }
    return undefined;
  }
}

class SqliteValueIterator<KDefault, VDefault> extends AbstractValueIterator<
  SqliteLevel<KDefault, VDefault>,
  KDefault,
  VDefault
> {
  private client: any;
  private iterator: IterableIterator<any>;

  constructor(
    db: SqliteLevel<KDefault, VDefault>,
    options: IteratorOptions<KDefault>,
    client: any
  ) {
    super(db, options);
    this.client = client;

    const { query, params } = queryFromOptions(options);
    const stmt = this.client.prepare(query);
    this.iterator = stmt.iterate(params);
  }

  async _next(): Promise<VDefault | undefined> {
    const result = this.iterator.next();
    if (!result.done) {
      return result.value.value;
    }
    return undefined;
  }
}

export class SqliteLevel<
  KDefault = string,
  VDefault = string
> extends AbstractLevel<Buffer | Uint8Array | string, KDefault, VDefault> {
  public db: Database.Database;
  private readOnly = false;

  constructor(options: SqliteLevelOptions<KDefault, VDefault>) {
    const encodings = { utf8: true };
    super({ encodings }, options);
    this.db = new Database(options.filename);
    this.db.pragma("journal_mode = WAL");
    if (options.readOnly !== undefined) {
      this.readOnly = options.readOnly;
    }
  }

  get type() {
    return "sqlite3";
  }

  async _open(options: AbstractOpenOptions): Promise<void> {
    this.db.exec("CREATE TABLE IF NOT EXISTS kv (key TEXT, value TEXT)");
  }

  async _close(): Promise<void> {
    this.db.close();
  }

  async _get(key: Buffer, options: any): Promise<Buffer> {
    const stmt = this.db.prepare("SELECT value FROM kv WHERE key = ?");
    const row = stmt.get(key.toString()) as any;
    if (row) {
      return row.value;
    }
    throw new ModuleError(`Key ${key} was not found`, {
      code: "LEVEL_NOT_FOUND",
    });
  }

  async _put(key: Buffer, value: Buffer, options: any): Promise<void> {
    if (this.readOnly) {
      throw new ModuleError("not authorized to write to branch", {
        code: "LEVEL_READ_ONLY",
      });
    }
    const stmt = this.db.prepare("INSERT INTO kv (key, value) VALUES (?, ?)");
    stmt.run(key.toString(), value.toString());
  }

  async _del(key: Buffer, options: any): Promise<void> {
    if (this.readOnly) {
      throw new ModuleError("not authorized to write to branch", {
        code: "LEVEL_READ_ONLY",
      });
    }
    const stmt = this.db.prepare("DELETE FROM kv WHERE key = ?");
    stmt.run(key.toString());
  }

  // async _batch(
  //   batch: BatchOperation[],
  //   options: any,
  //   callback: (error?: Error) => void
  // ): Promise<void> {
  //   if (this.readOnly) {
  //     return this.nextTick(
  //       callback,
  //       new ModuleError("not authorized to write to branch", {
  //         code: "LEVEL_READ_ONLY",
  //       })
  //     );
  //   }

  //   let batches: string[] = [];
  //   let curBatch: string[] = [];
  //   let curType: string | undefined = undefined;
  //   for (const op of batch) {
  //     if (curType === undefined) {
  //       curType = op.type;
  //     } else if (curType !== op.type) {
  //       if (curType === "put") {
  //         batches.push(
  //           `INSERT INTO kv (key, value) VALUES ${curBatch.join(",")}`
  //         );
  //       } else if (curType === "del") {
  //         batches.push(`DELETE FROM kv WHERE key IN (${curBatch.join(",")})`);
  //       }
  //       curBatch = [];
  //       curType = op.type;
  //     }
  //     if (op.type === "put") {
  //       curBatch.push(`('${op.key.toString()}', '${op.value.toString()}')`);
  //     } else if (op.type === "del") {
  //       curBatch.push(`'${op.key.toString()}'`);
  //     }
  //   }
  //   if (curBatch.length > 0) {
  //     if (curType === "put") {
  //       batches.push(
  //         `INSERT INTO kv (key, value) VALUES ${curBatch.join(",")}`
  //       );
  //     } else if (curType === "del") {
  //       batches.push(`DELETE FROM kv WHERE key IN (${curBatch.join(",")})`);
  //     }
  //   }
  //   for (const batch of batches) {
  //     this.db.exec(batch);
  //   }
  //   this.nextTick(callback);
  // }

  async _batch(batch: BatchOperation[], options: any): Promise<void> {
    if (this.readOnly) {
      throw new ModuleError("not authorized to write to branch", {
        code: "LEVEL_READ_ONLY",
      });
    }

    const putStmt = this.db.prepare(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)"
    );
    const delStmt = this.db.prepare("DELETE FROM kv WHERE key = ?");

    this.db.transaction(() => {
      for (const op of batch) {
        if (op.type === "put") {
          putStmt.run(op.key.toString(), op.value.toString());
        } else if (op.type === "del") {
          delStmt.run(op.key.toString());
        }
      }
    })();
  }

  async _clear(options: any): Promise<void> {
    this.db.exec(`DELETE FROM kv WHERE key like '${options.gte}%'`);
  }

  _iterator(
    options: IteratorOptions<KDefault>
  ): SqliteIterator<KDefault, VDefault> {
    return new SqliteIterator<KDefault, VDefault>(this, options, this.db);
  }

  _keys(
    options: IteratorOptions<KDefault>
  ): SqliteKeyIterator<KDefault, VDefault> {
    return new SqliteKeyIterator<KDefault, VDefault>(this, options, this.db);
  }

  _values(
    options: IteratorOptions<KDefault>
  ): SqliteValueIterator<KDefault, VDefault> {
    return new SqliteValueIterator<KDefault, VDefault>(this, options, this.db);
  }
}
