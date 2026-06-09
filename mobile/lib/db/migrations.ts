import type { SQLiteDatabase } from 'expo-sqlite'

/**
 * Versioned, idempotent device migrations driven by `PRAGMA user_version`.
 *
 * Each entry's `up` SQL runs exactly once, in order, inside a transaction, and
 * bumps user_version. This is deliberately hand-written (not drizzle-kit) to
 * avoid bundling `.sql` assets through Metro; it must stay in sync with
 * `lib/db/schema.ts`.
 */

type Migration = { version: number; up: string }

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY NOT NULL,
        status TEXT NOT NULL,
        assigned_to TEXT,
        contact_name TEXT,
        contact_wa_id TEXT,
        last_message_at TEXT,
        last_message_preview TEXT,
        last_message_direction TEXT,
        last_message_status TEXT,
        last_message_type TEXT,
        unread_count INTEGER NOT NULL DEFAULT 0,
        pinned_at TEXT,
        ai_handled INTEGER NOT NULL DEFAULT 0,
        seq INTEGER,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON conversations (pinned_at);
      CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations (last_message_at);
      CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations (contact_name, contact_wa_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations (status);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        wa_message_id TEXT,
        sent_by TEXT,
        direction TEXT NOT NULL,
        type TEXT NOT NULL,
        body TEXT,
        media_url TEXT,
        media_thumb_url TEXT,
        media_file_size INTEGER,
        thumbhash TEXT,
        media_width INTEGER,
        media_height INTEGER,
        media_mime_type TEXT,
        media_filename TEXT,
        media_status TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        reply_to_message_id TEXT,
        deleted_at TEXT,
        edited_at TEXT,
        starred_at TEXT,
        sent_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        local_preview_uri TEXT,
        seq INTEGER,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, sent_at);
      CREATE INDEX IF NOT EXISTS idx_messages_starred ON messages (starred_at);
      CREATE INDEX IF NOT EXISTS idx_messages_wa_message_id ON messages (wa_message_id);

      CREATE TABLE IF NOT EXISTS media_blobs (
        storage_key TEXT PRIMARY KEY NOT NULL,
        sha256 TEXT,
        thumbhash TEXT,
        width INTEGER,
        height INTEGER,
        duration_ms INTEGER,
        mime_type TEXT,
        size_bytes INTEGER,
        local_uri TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        conversation_id TEXT,
        payload TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        next_attempt_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_next_attempt ON outbox (next_attempt_at);

      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `,
  },
  {
    version: 2,
    up: `
      ALTER TABLE messages ADD COLUMN media_local_path TEXT;
    `,
  },
]

/** Apply any pending migrations. Safe to call on every app start. */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  let current = row?.user_version ?? 0

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(migration.up)
    })
    // PRAGMA cannot be parameterised; the version is a trusted integer literal.
    await db.execAsync(`PRAGMA user_version = ${migration.version}`)
    current = migration.version
  }
}

export const LATEST_DB_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version
