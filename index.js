#!/usr/bin/env node

const blessed = require("blessed");
const { Configuration, OpenAIApi } = require("openai");
const sqlite3 = require("sqlite3").verbose();
const dotenv = require("dotenv");
const fs = require("fs");
const yaml = require("js-yaml");

// Load environment variables
dotenv.config();

// Load configuration
const config = yaml.load(fs.readFileSync("./config.yaml", "utf8"));

// Initialize OpenAI API
const openaiConfig = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(openaiConfig);

// Initialize SQLite database
const db = new sqlite3.Database("./data/conversations.db");

// Create tables if they don't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      content TEXT,
      role TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    )
  `);
});

// Initialize Blessed screen
const screen = blessed.screen({
  smartCSR: true,
  title: "AI Chat CLI",
});

// Left sidebar for threads
const threadList = blessed.list({
  parent: screen,
  label: " Threads ",
  width: "30%",
  height: "100%-1",
  keys: true,
  vi: true,
  border: "line",
  style: {
    selected: {
      bg: "blue",
    },
  },
});

// Main chat area
const chatArea = blessed.box({
  parent: screen,
  label: " Conversation ",
  left: "30%",
  width: "70%",
  height: "100%-3",
  keys: true,
  vi: true,
  scrollable: true,
  alwaysScroll: true,
  border: "line",
});

// Input field
const input = blessed.textbox({
  parent: screen,
  bottom: 1,
  height: 1,
  inputOnFocus: true,
});

// Status bar
const statusBar = blessed.box({
  parent: screen,
  bottom: 0,
  height: 1,
  content: "Model: GPT-3.5 Turbo | Tokens Used: 0",
  style: {
    bg: "gray",
    fg: "black",
  },
});

// Load conversations into threadList
function loadConversations() {
  db.all(
    `SELECT id, title FROM conversations ORDER BY created_at DESC`,
    (err, rows) => {
      if (err) throw err;
      const items = rows.map((row) => `[#${row.id}] ${row.title}`);
      threadList.setItems(items);
      screen.render();
    }
  );
}

// Current conversation state
let currentConversationId = null;
let tokenUsage = 0;

// Load messages for the selected conversation
function loadMessages(conversationId) {
  chatArea.setContent("");
  db.all(
    `SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    [conversationId],
    (err, rows) => {
      if (err) throw err;
      rows.forEach((row) => {
        chatArea.pushLine(`{bold}${row.role}:{/bold} ${row.content}`);
      });
      chatArea.setScrollPerc(100);
      screen.render();
    }
  );
}

// Handle thread selection
threadList.on("select", (_, index) => {
  const item = threadList.getItem(index).getText();
  const conversationId = parseInt(item.match(/\[#(\d+)\]/)[1]);
  currentConversationId = conversationId;
  loadMessages(conversationId);
});

// Input handling
input.key("enter", async () => {
  const message = input.getValue();
  input.clearValue();
  screen.render();

  if (message.startsWith("/")) {
    handleCommand(message);
    return;
  }

  if (!currentConversationId) {
    // Create a new conversation
    db.run(
      `INSERT INTO conversations (title) VALUES (?)`,
      [`Conversation started at ${new Date().toLocaleString()}`],
      function (err) {
        if (err) throw err;
        currentConversationId = this.lastID;
        loadConversations();
        saveMessage(currentConversationId, "user", message);
        generateAIResponse(message);
      }
    );
  } else {
    saveMessage(currentConversationId, "user", message);
    generateAIResponse(message);
  }
});

// Save message to the database
function saveMessage(conversationId, role, content) {
  db.run(
    `INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)`,
    [conversationId, role, content],
    (err) => {
      if (err) throw err;
      chatArea.pushLine(`{bold}${role}:{/bold} ${content}`);
      chatArea.setScrollPerc(100);
      screen.render();
    }
  );
}

// Generate AI response using OpenAI API
async function generateAIResponse(userMessage) {
  const messages = [];
  db.all(
    `SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    [currentConversationId],
    async (err, rows) => {
      if (err) throw err;
      rows.forEach((row) => {
        messages.push({ role: row.role, content: row.content });
      });

      try {
        const response = await openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: messages,
        });

        const aiMessage = response.data.choices[0].message.content;
        tokenUsage += response.data.usage.total_tokens;

        saveMessage(currentConversationId, "assistant", aiMessage);
        updateStatusBar();
      } catch (error) {
        saveMessage(
          currentConversationId,
          "assistant",
          "Error: Unable to generate response."
        );
        console.error(error);
      }
    }
  );
}

// Handle commands
function handleCommand(command) {
  const args = command.slice(1).split(" ");
  switch (args[0]) {
    case "new":
      currentConversationId = null;
      chatArea.setContent("");
      screen.render();
      break;
    case "model":
      // Switch model (not fully implemented)
      // For example: /model gpt-4
      statusBar.setContent(`Model: ${args[1]} | Tokens Used: ${tokenUsage}`);
      screen.render();
      break;
    case "help":
      chatArea.pushLine("{bold}Available Commands:{/bold}");
      chatArea.pushLine("/new - Start a new conversation");
      chatArea.pushLine("/model [model_name] - Switch AI model");
      chatArea.pushLine("/help - Show this help message");
      chatArea.setScrollPerc(100);
      screen.render();
      break;
    default:
      chatArea.pushLine(`Unknown command: ${command}`);
      chatArea.setScrollPerc(100);
      screen.render();
      break;
  }
}

// Update status bar
function updateStatusBar() {
  statusBar.setContent(`Model: GPT-3.5 Turbo | Tokens Used: ${tokenUsage}`);
  screen.render();
}

// Keybindings
screen.key(["C-c"], () => {
  db.close();
  process.exit(0);
});

input.focus();
loadConversations();
screen.render();
