// A throwaway in-memory database for tests. It wraps Node's built-in SQLite
// with the same async methods expo-sqlite provides, so the real query code in
// src/db/ runs unchanged. Nothing here touches the app's database on a phone.

import { DatabaseSync } from 'node:sqlite';
import { migrateDbIfNeeded } from '../../src/db/migrations.js';

function toParams(params) {
  return params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
}

function plain(row) {
  return row ? { ...row } : null;
}

export function wrapDatabase(raw) {
  const db = {
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, ...params) {
      const result = raw.prepare(sql).run(...toParams(params));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getFirstAsync(sql, ...params) {
      return plain(raw.prepare(sql).get(...toParams(params)));
    },
    async getAllAsync(sql, ...params) {
      return raw
        .prepare(sql)
        .all(...toParams(params))
        .map(plain);
    },
    async withExclusiveTransactionAsync(task) {
      raw.exec('BEGIN EXCLUSIVE');
      try {
        await task(db);
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}

export async function createTestDatabase() {
  const raw = new DatabaseSync(':memory:');
  const db = wrapDatabase(raw);
  await migrateDbIfNeeded(db);
  return { db, raw };
}
