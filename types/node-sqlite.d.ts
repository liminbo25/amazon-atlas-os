declare module "node:sqlite" {
  export interface StatementSync {
    all(namedParameters?: Record<string, unknown>): Record<string, unknown>[];
    get(namedParameters?: Record<string, unknown>): Record<string, unknown> | undefined;
    run(namedParameters?: Record<string, unknown>): {
      changes: number;
      lastInsertRowid: number | bigint;
    };
  }

  export class DatabaseSync {
    constructor(path: string, options?: Record<string, unknown>);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
