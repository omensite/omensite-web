import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

export const emptyBrokerWorkspace = () => ({ connection: null, tools: [], snapshots: [], actions: [], events: [], paused: true });
const copy = (value) => structuredClone(value);
const validOwner = (id) => {
  if (typeof id !== "string" || !id.trim() || id.length > 200) throw new Error("Broker owner is required");
  return id;
};
function encode(state) {
  const json = JSON.stringify(state);
  if (Buffer.byteLength(json) > 3_000_000) throw new Error("Broker storage capacity reached");
  return json;
}
export function createMemoryBrokerRepository() {
  const owners = new Map();
  return {
    getStorageStatus: () => ({ kind: "memory", persistent: false }),
    async read(owner) { return copy(owners.get(validOwner(owner)) ?? emptyBrokerWorkspace()); },
    async update(owner, change) {
      const state = copy(owners.get(validOwner(owner)) ?? emptyBrokerWorkspace());
      const result = change(state);
      if (result?.then) throw new Error("Broker transactions cannot contain asynchronous work");
      owners.set(owner, JSON.parse(encode(state)));
      return copy(result);
    },
    async close() {},
  };
}
export function createSqliteBrokerRepository(filename) {
  mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS broker_workspaces(owner_id TEXT PRIMARY KEY, payload TEXT NOT NULL)");
  return {
    getStorageStatus: () => ({ kind: "sqlite", persistent: true }),
    async read(owner) { return JSON.parse(db.prepare("SELECT payload FROM broker_workspaces WHERE owner_id=?").get(validOwner(owner))?.payload ?? JSON.stringify(emptyBrokerWorkspace())); },
    async update(owner, change) {
      validOwner(owner);
      db.exec("BEGIN IMMEDIATE");
      try {
        const state = JSON.parse(db.prepare("SELECT payload FROM broker_workspaces WHERE owner_id=?").get(owner)?.payload ?? JSON.stringify(emptyBrokerWorkspace()));
        const result = change(state);
        if (result?.then) throw new Error("Broker transactions cannot contain asynchronous work");
        db.prepare("INSERT INTO broker_workspaces(owner_id,payload) VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET payload=excluded.payload").run(owner, encode(state));
        db.exec("COMMIT");
        return copy(result);
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    async close() { db.close(); },
  };
}
export function createPostgresBrokerRepository(pool) {
  return {
    getStorageStatus: () => ({ kind: "postgres", persistent: true }),
    async read(owner) { return (await pool.query("SELECT payload FROM broker_workspaces WHERE owner_id=$1", [validOwner(owner)])).rows[0]?.payload ?? emptyBrokerWorkspace(); },
    async update(owner, change) {
      validOwner(owner);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL statement_timeout='5s'");
        await client.query("INSERT INTO broker_workspaces(owner_id,payload) VALUES($1,$2) ON CONFLICT DO NOTHING", [owner, JSON.stringify(emptyBrokerWorkspace())]);
        const state = (await client.query("SELECT payload FROM broker_workspaces WHERE owner_id=$1 FOR UPDATE", [owner])).rows[0].payload;
        const result = change(state);
        if (result?.then) throw new Error("Broker transactions cannot contain asynchronous work");
        await client.query("UPDATE broker_workspaces SET payload=$2,updated_at=now() WHERE owner_id=$1", [owner, encode(state)]);
        await client.query("COMMIT");
        return copy(result);
      } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
      finally { client.release(); }
    },
    async close() {},
  };
}
