const { DatabaseSync } = require("node:sqlite");
const { logger } = require("../utils/Logger");

class Database {
  constructor(config) {
    this.config = config;
    this.db = null;
  }

  async initialize() {
    try {
      // Create new SQLite connection with native module
      this.db = new DatabaseSync(this.config.path, {
        enableForeignKeyConstraints: true,
        enableDoubleQuotedStringLiterals: false,
      });

      // Create schema
      await this.initializeSchema();

      logger.info("Database initialized successfully with native SQLite");
    } catch (error) {
      logger.error("Failed to initialize database:", error);
      throw error;
    }
  }

  async initializeSchema() {
    this.db.exec(`
      -- Conversations table
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        parent_id INTEGER,
        thread_path TEXT,
        metadata TEXT,
        FOREIGN KEY(parent_id) REFERENCES conversations(id)
      ) STRICT;

      -- Messages table
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY,
        conversation_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        token_count INTEGER,
        model TEXT,
        metadata TEXT,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id)
      ) STRICT;

      -- Triggers for updated_at
      CREATE TRIGGER IF NOT EXISTS conversations_update_trigger
      AFTER UPDATE ON conversations
      BEGIN
        UPDATE conversations 
        SET updated_at = CURRENT_TIMESTAMP 
        WHERE id = NEW.id;
      END;
    `);
  }

  async createConversation(title = null, parentId = null) {
    try {
      const stmt = this.db.prepare(
        `INSERT INTO conversations (title, parent_id, thread_path)
         VALUES (?, ?, ?)`
      );

      let threadPath;
      if (parentId) {
        const parent = await this.getConversation(parentId);
        threadPath = parent.thread_path
          ? `${parent.thread_path}.${parentId}`
          : parentId.toString();
      }

      const result = stmt.run(
        title || `Conversation ${new Date().toLocaleString()}`,
        parentId,
        threadPath
      );

      logger.info("Created new conversation", {
        conversationId: result.lastInsertRowid,
        parentId,
      });

      return Number(result.lastInsertRowid);
    } catch (error) {
      logger.error("Failed to create conversation:", error);
      throw error;
    }
  }

  async saveMessage({
    conversationId,
    role,
    content,
    model = null,
    tokenCount = null,
  }) {
    try {
      const stmt = this.db.prepare(
        `INSERT INTO messages (conversation_id, role, content, model, token_count)
         VALUES (?, ?, ?, ?, ?)`
      );

      const result = stmt.run(conversationId, role, content, model, tokenCount);

      // Update conversation's updated_at timestamp
      this.db
        .prepare(
          "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .run(conversationId);

      logger.debug("Saved message", {
        messageId: result.lastInsertRowid,
        conversationId,
        role,
      });

      return Number(result.lastInsertRowid);
    } catch (error) {
      logger.error("Failed to save message:", error);
      throw error;
    }
  }

  async getConversation(id) {
    try {
      return this.db
        .prepare("SELECT * FROM conversations WHERE id = ?")
        .get(id);
    } catch (error) {
      logger.error("Failed to get conversation:", error);
      throw error;
    }
  }

  async getConversationHistory(id) {
    try {
      return this.db
        .prepare(
          `SELECT role, content, model, token_count, created_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC`
        )
        .all(id);
    } catch (error) {
      logger.error("Failed to get conversation history:", error);
      throw error;
    }
  }

  async getRecentConversations(limit = 50) {
    try {
      return this.db
        .prepare(
          `SELECT c.*,
                COUNT(DISTINCT m.id) as message_count,
                MAX(m.created_at) as last_message_at
         FROM conversations c
         LEFT JOIN messages m ON c.id = m.conversation_id
         WHERE c.parent_id IS NULL
         GROUP BY c.id
         ORDER BY c.updated_at DESC
         LIMIT ?`
        )
        .all(limit);
    } catch (error) {
      logger.error("Failed to get recent conversations:", error);
      throw error;
    }
  }

  async searchConversations(query) {
    try {
      return this.db
        .prepare(
          `SELECT c.*, 
                COUNT(DISTINCT m.id) as message_count,
                MAX(m.created_at) as last_message_at
         FROM conversations c
         LEFT JOIN messages m ON c.id = m.conversation_id
         WHERE c.title LIKE ?
            OR c.id IN (
              SELECT DISTINCT conversation_id 
              FROM messages 
              WHERE content LIKE ?
            )
         GROUP BY c.id
         ORDER BY c.updated_at DESC
         LIMIT 50`
        )
        .all(`%${query}%`, `%${query}%`);
    } catch (error) {
      logger.error("Failed to search conversations:", error);
      throw error;
    }
  }

  async close() {
    try {
      this.db.close();
      logger.info("Database connection closed");
    } catch (error) {
      logger.error("Error closing database:", error);
      throw error;
    }
  }
}

module.exports = { Database };
