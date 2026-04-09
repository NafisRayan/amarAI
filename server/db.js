import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "chat.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const mapConversation = (row) => ({
  id: row.id,
  title: row.title,
  provider: row.provider,
  model: row.model,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapMessage = (row) => ({
  id: row.id,
  conversationId: row.conversation_id,
  role: row.role,
  content: row.content,
  createdAt: row.created_at,
});

export const listConversations = () => {
  const rows = db
    .prepare(
      `
      SELECT id, title, provider, model, created_at, updated_at
      FROM conversations
      ORDER BY datetime(updated_at) DESC
    `
    )
    .all();

  return rows.map(mapConversation);
};

export const getConversationWithMessages = (conversationId) => {
  const conversationRow = db
    .prepare(
      `
      SELECT id, title, provider, model, created_at, updated_at
      FROM conversations
      WHERE id = ?
    `
    )
    .get(conversationId);

  if (!conversationRow) return null;

  const messageRows = db
    .prepare(
      `
      SELECT id, conversation_id, role, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY datetime(created_at) ASC
    `
    )
    .all(conversationId);

  return {
    ...mapConversation(conversationRow),
    messages: messageRows.map(mapMessage),
  };
};

export const createConversation = ({ id, title, provider, model, createdAt }) => {
  db.prepare(
    `
    INSERT INTO conversations (id, title, provider, model, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(id, title, provider, model, createdAt, createdAt);
};

export const updateConversation = ({ id, title, provider, model, updatedAt }) => {
  db.prepare(
    `
    UPDATE conversations
    SET title = ?, provider = ?, model = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(title, provider, model, updatedAt, id);
};

export const addMessage = ({ id, conversationId, role, content, createdAt }) => {
  db.prepare(
    `
    INSERT INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `
  ).run(id, conversationId, role, content, createdAt);
};

export const deleteConversation = (conversationId) => {
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(conversationId);
};

const SETTINGS_KEY_PROVIDER = "provider_settings";

export const getProviderSettings = () => {
  const row = db
    .prepare(
      `
      SELECT value
      FROM app_settings
      WHERE key = ?
    `
    )
    .get(SETTINGS_KEY_PROVIDER);

  if (!row) return null;

  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
};

export const saveProviderSettings = (value, updatedAt) => {
  db.prepare(
    `
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `
  ).run(SETTINGS_KEY_PROVIDER, JSON.stringify(value), updatedAt);
};
