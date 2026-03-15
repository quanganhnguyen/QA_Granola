import { DatabaseManager } from '../../../src/storage/sqlite/DatabaseManager';
import path from 'path';
import os from 'os';
import fs from 'fs';

function tempDbPath(): string {
  return path.join(os.tmpdir(), `qa-nola-test-${Date.now()}-${Math.random()}.db`);
}

describe('DatabaseManager', () => {
  let dbPath: string;
  let db: DatabaseManager;

  beforeEach(() => {
    dbPath = tempDbPath();
    db = new DatabaseManager(dbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('creates database file on construction', () => {
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  test('migrate creates sessions table', () => {
    db.migrate();
    const result = db.getDb().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
    ).get();
    expect(result).toBeDefined();
  });

  test('migrate creates transcript_segments table', () => {
    db.migrate();
    const result = db.getDb().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transcript_segments'"
    ).get();
    expect(result).toBeDefined();
  });

  test('migrate creates notes table', () => {
    db.migrate();
    const result = db.getDb().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes'"
    ).get();
    expect(result).toBeDefined();
  });

  test('migrate creates merged_outputs table', () => {
    db.migrate();
    const result = db.getDb().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='merged_outputs'"
    ).get();
    expect(result).toBeDefined();
  });

  test('migrate is idempotent', () => {
    db.migrate();
    expect(() => db.migrate()).not.toThrow();
  });
});
