declare module 'sqlite3' {
  class Database {
    close(callback?: (err: Error | null) => void): void;
    run(sql: string, params: unknown[], callback?: (err: Error | null) => void): Database;
    get<T>(sql: string, params: unknown[], callback: (err: Error | null, row: T | undefined) => void): Database;
    all<T>(sql: string, params: unknown[], callback: (err: Error | null, rows: T[]) => void): Database;
  }

  namespace Database {
    export { Database };
  }

  export = Database;
}

declare module 'sqlite' {
  interface Database {
    exec(sql: string): Promise<Database>;
    run(sql: string, ...params: unknown[]): Promise<{ changes: number; lastID: number }>;
    get<T>(sql: string, ...params: unknown[]): Promise<T | undefined>;
    all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
    close(): Promise<void>;
  }

  interface OpenOptions {
    filename: string;
    driver?: unknown;
  }

  export function open(options: OpenOptions): Promise<Database>;
}

declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  interface Database {
    run(sql: string, params?: unknown[]): SqlJsRunResult;
    exec(sql: string): SqlJsExecResult[];
    prepare(sql: string): SqlJsStatement;
    close(): void;
    export(): Uint8Array;
    getRowsModified(): number;
  }

  interface SqlJsStatement {
    bind(params?: unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  interface SqlJsExecResult {
    columns: string[];
    values: unknown[][];
  }

  interface SqlJsRunResult {
    changes: number;
    lastInsertRowid: number | BigInt;
  }

  interface SqlJsConfig {
    locateFile?: (file: string, path: string) => string;
  }

  function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;

  export default initSqlJs;
  export { Database };
}
