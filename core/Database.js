import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { logger } from "../utils/Logger.js";

sqlite3.verbose();

class Database {
  constructor(config) {
    this.config = config;
    this.db = null;
  }

  async initialize() {
    try {
      // Open database with promises wrapper
      this.db = await open({
        filename: this.config.path,
        driver: sqlite3.Database,
      });

      // Enable WAL mode for better concurrency
      if (this.config.enableWAL) {
        await this.db.run("PRAGMA journal_mode = WAL");
      }

      // Create schema
      await this.initializeSchema();

      logger.info("Database initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize database:", error);
      throw error;
    }
  }

  async initializeSchema() {
    await this.db.exec(`
      -- Conversations table
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        parent_id INTEGER,
        thread_path TEXT,
        metadata TEXT,
        FOREIGN KEY(parent_id) REFERENCES conversations(id)
      );

      -- Messages table
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        token_count INTEGER,
        model TEXT,
        metadata TEXT,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id)
      );

      -- Triggers for updated_at
      CREATE TRIGGER IF NOT EXISTS conversations_update_trigger
      AFTER UPDATE ON conversations
      BEGIN
        UPDATE conversations 
        SET updated_at = CURRENT_TIMESTAMP 
        WHERE id = NEW.id;
      END;

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_conversations_thread_path 
      ON conversations(thread_path);
      
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
      ON messages(conversation_id);
      
      CREATE INDEX IF NOT EXISTS idx_conversations_parent_id 
      ON conversations(parent_id);
    `);
  }

  async createConversation(title = null, parentId = null) {
    try {
      let threadPath;
      if (parentId) {
        const parent = await this.getConversation(parentId);
        threadPath = parent.thread_path
          ? `${parent.thread_path}.${parentId}`
          : parentId.toString();
      }

      const result = await this.db.run(
        `INSERT INTO conversations (title, parent_id, thread_path)
         VALUES (?, ?, ?)`,
        [
          title || `Conversation ${new Date().toLocaleString()}`,
          parentId,
          threadPath,
        ]
      );

      logger.info("Created new conversation", {
        conversationId: result.lastID,
        parentId,
      });

      return result.lastID;
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
      const result = await this.db.run(
        `INSERT INTO messages (conversation_id, role, content, model, token_count)
         VALUES (?, ?, ?, ?, ?)`,
        [conversationId, role, content, model, tokenCount]
      );

      // Update conversation's updated_at timestamp
      await this.db.run(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [conversationId]
      );

      logger.debug("Saved message", {
        messageId: result.lastID,
        conversationId,
        role,
      });

      return result.lastID;
    } catch (error) {
      logger.error("Failed to save message:", error);
      throw error;
    }
  }

  async getConversation(id) {
    try {
      return await this.db.get("SELECT * FROM conversations WHERE id = ?", [
        id,
      ]);
    } catch (error) {
      logger.error("Failed to get conversation:", error);
      throw error;
    }
  }

  async getConversationHistory(id) {
    try {
      return await this.db.all(
        `SELECT role, content, model, token_count, created_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC`,
        [id]
      );
    } catch (error) {
      logger.error("Failed to get conversation history:", error);
      throw error;
    }
  }

  async getRecentConversations(limit = 50) {
    try {
      return await this.db.all(
        `SELECT c.*,
                COUNT(DISTINCT m.id) as message_count,
                MAX(m.created_at) as last_message_at
         FROM conversations c
         LEFT JOIN messages m ON c.id = m.conversation_id
         WHERE c.parent_id IS NULL
         GROUP BY c.id
         ORDER BY c.updated_at DESC
         LIMIT ?`,
        [limit]
      );
    } catch (error) {
      logger.error("Failed to get recent conversations:", error);
      throw error;
    }
  }

  async getConversationThread(id) {
    try {
      const conversation = await this.getConversation(id);
      if (!conversation) return [];

      if (conversation.thread_path) {
        return await this.db.all(
          `SELECT * FROM conversations 
           WHERE thread_path LIKE ? OR id = ?
           ORDER BY created_at ASC`,
          [`${conversation.thread_path}.${id}%`, id]
        );
      }

      return [conversation];
    } catch (error) {
      logger.error("Failed to get conversation thread:", error);
      throw error;
    }
  }

  async searchConversations(query) {
    try {
      return await this.db.all(
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
         LIMIT 50`,
        [`%${query}%`, `%${query}%`]
      );
    } catch (error) {
      logger.error("Failed to search conversations:", error);
      throw error;
    }
  }

  async close() {
    try {
      await this.db.close();
      logger.info("Database connection closed");
    } catch (error) {
      logger.error("Error closing database:", error);
      throw error;
    }
  }
}

// module.exports = { Database };
export { Database };
