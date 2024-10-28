const path = require("path");
const fs = require("fs").promises;
const { DatabaseSync } = require("node:sqlite");
const { logger } = require("../src/utils/Logger");

class TestEnvironment {
  constructor() {
    this.testDbPath = path.join(__dirname, "test.db");
    this.db = null;
  }

  async setup() {
    try {
      // Ensure clean state
      await this.cleanup();

      // Create test database
      this.db = new DatabaseSync(this.testDbPath, {
        enableForeignKeyConstraints: true,
      });

      // Initialize schema (copied from Database.js)
      await this.initializeSchema();

      // Set up test data
      await this.seedTestData();

      logger.info("Test environment initialized");

      // Return test configuration
      return {
        database: {
          path: this.testDbPath,
          enableWAL: false,
        },
        ai: {
          apiKey: "test-key",
          baseURL: "https://openrouter.ai/api/v1",
          defaultModel: "openai/gpt-3.5-turbo",
        },
        ui: {
          theme: "dark",
        },
      };
    } catch (error) {
      logger.error("Failed to initialize test environment:", error);
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

  async seedTestData() {
    // Create some test conversations
    const conv1 = this.db
      .prepare("INSERT INTO conversations (title) VALUES (?)")
      .run("Test Conversation 1");

    const conv2 = this.db
      .prepare("INSERT INTO conversations (title) VALUES (?)")
      .run("Test Conversation 2");

    // Add some test messages
    const messageStmt = this.db.prepare(
      "INSERT INTO messages (conversation_id, role, content, model, token_count) VALUES (?, ?, ?, ?, ?)"
    );

    // Conversation 1 messages
    messageStmt.run(conv1.lastInsertRowid, "user", "Hello, AI!", null, null);
    messageStmt.run(
      conv1.lastInsertRowid,
      "assistant",
      "Hi! How can I help?",
      "gpt-3.5-turbo",
      10
    );

    // Conversation 2 messages
    messageStmt.run(
      conv2.lastInsertRowid,
      "user",
      "Tell me about databases",
      null,
      null
    );
    messageStmt.run(
      conv2.lastInsertRowid,
      "assistant",
      "Databases are...",
      "gpt-3.5-turbo",
      15
    );

    logger.info("Test data seeded successfully");
  }

  async cleanup() {
    try {
      // Close existing connection if any
      if (this.db) {
        this.db.close();
      }

      // Delete test database file if it exists
      try {
        await fs.unlink(this.testDbPath);
      } catch (error) {
        if (error.code !== "ENOENT") throw error; // Ignore if file doesn't exist
      }

      logger.info("Test environment cleaned up");
    } catch (error) {
      logger.error("Failed to cleanup test environment:", error);
      throw error;
    }
  }
}

module.exports = { TestEnvironment };
