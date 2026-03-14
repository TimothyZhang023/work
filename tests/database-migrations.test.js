import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots = [];
const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, "..");
const databaseModulePath = path.join(repoRoot, "server", "models", "database.js");

afterEach(() => {
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
  delete process.env.DB_PATH;
});

describe("database migrations", () => {
  it("migrates legacy skills tables before creating source lookup indexes", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cw-db-migrate-"));
    const dbPath = path.join(tempRoot, "legacy.db");
    tempRoots.push(tempRoot);

    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      CREATE TABLE skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        prompt TEXT NOT NULL,
        examples TEXT,
        tools TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    legacyDb.close();

    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `process.env.DB_PATH = ${JSON.stringify(
          dbPath
        )}; await import(${JSON.stringify(
          databaseModulePath
        )});`,
      ],
      {
        cwd: repoRoot,
        stdio: "pipe",
      }
    );

    const migratedDb = new Database(dbPath, { readonly: true });
    const columns = migratedDb
      .prepare("PRAGMA table_info(skills)")
      .all()
      .map((column) => column.name);
    const indexes = migratedDb
      .prepare("PRAGMA index_list(skills)")
      .all()
      .map((index) => index.name);
    migratedDb.close();

    expect(columns).toContain("source_type");
    expect(columns).toContain("source_location");
    expect(columns).toContain("source_item_path");
    expect(columns).toContain("source_refreshed_at");
    expect(indexes).toContain("idx_skills_source_lookup");
  });

  it("adds context_window to legacy conversations tables", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cw-db-migrate-"));
    const dbPath = path.join(tempRoot, "legacy-conversations.db");
    tempRoots.push(tempRoot);

    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      CREATE TABLE conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL,
        title TEXT NOT NULL,
        system_prompt TEXT DEFAULT '',
        tool_names TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    legacyDb.close();

    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `process.env.DB_PATH = ${JSON.stringify(
          dbPath
        )}; await import(${JSON.stringify(
          databaseModulePath
        )});`,
      ],
      {
        cwd: repoRoot,
        stdio: "pipe",
      }
    );

    const migratedDb = new Database(dbPath, { readonly: true });
    const columns = migratedDb
      .prepare("PRAGMA table_info(conversations)")
      .all()
      .map((column) => column.name);
    migratedDb.close();

    expect(columns).toContain("context_window");
  });
});
