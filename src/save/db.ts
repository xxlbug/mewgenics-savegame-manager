import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

let sql: SqlJsStatic | null = null;

/**
 * Initialize sql.js once. In the browser pass a locateFile that returns the
 * bundled wasm URL; in Node (tests) omit it and sql.js finds the wasm itself.
 */
export async function initSql(
  locateFile?: (file: string) => string,
): Promise<void> {
  if (sql) return;
  sql = await initSqlJs(locateFile ? { locateFile } : undefined);
}

/** Open savegame bytes as an in-memory, read-only-by-convention database. */
export function openSave(bytes: Uint8Array): Database {
  if (!sql) throw new Error('initSql() must be called first');
  const db = new sql.Database(bytes);
  // Force parse now so corrupt files fail here, not on first query.
  db.exec("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1");
  return db;
}
