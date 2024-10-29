import { EventEmitter } from "events";
import { Database } from "./Database.js";
import { AIClient } from "./AIClient.js";
import { Screen } from "./ui/Screen.js";
import { VimHandler } from "./ui/VimHandler.js";
import { CommandHandler } from "../utils/Commands.js";
import { logger } from "../utils/Logger.js";

class Controller extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.currentConversationId = null;
    this.currentMode = "normal";
    this.isProcessingMessage = false;
  }

  async initialize() {
    try {
      // Initialize core components
      this.db = new Database(this.config.database);
      this.ai = new AIClient(this.config.ai);
      this.screen = new Screen(this.config.ui);
      this.vim = new VimHandler(this.screen);
      this.commands = new CommandHandler(this);

      // Initialize database
      await this.db.initialize();

      // Setup UI
      await this.screen.initialize();

      // Setup event handlers
      this.setupEventHandlers();

      logger.info("Controller initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize controller:", error);
      throw error;
    }
  }

  setupEventHandlers() {
    // VIM mode events
    this.vim.on("modeChange", (mode) => {
      this.currentMode = mode;
      this.screen.updateStatus({ mode });
    });

    // Command events
    this.vim.on("command", async (cmd) => {
      try {
        await this.commands.execute(cmd);
      } catch (error) {
        this.screen.showError(`Command failed: ${error.message}`);
      }
    });

    // Message handling
    this.screen.on("message", async (content) => {
      await this.handleMessage(content);
    });

    // Thread navigation
    this.vim.on("previousThread", async () => {
      const threads = await this.db.getRecentConversations();
      const currentIndex = threads.findIndex(
        (t) => t.id === this.currentConversationId
      );
      if (currentIndex > 0) {
        await this.loadThread(threads[currentIndex - 1].id);
      }
    });

    this.vim.on("nextThread", async () => {
      const threads = await this.db.getRecentConversations();
      const currentIndex = threads.findIndex(
        (t) => t.id === this.currentConversationId
      );
      if (currentIndex < threads.length - 1) {
        await this.loadThread(threads[currentIndex + 1].id);
      }
    });

    // Search functionality
    this.vim.on("search", async (query) => {
      const results = await this.db.searchConversations(query);
      this.screen.updateThreadList(results);
    });

    // Handle streaming responses
    this.ai.on("chunk", (chunk) => {
      if (chunk.done) {
        this.screen.stopLoading();
      } else {
        this.screen.updateStreamingMessage(chunk.content);
      }
    });
  }

  async start() {
    try {
      // Load initial conversations
      const conversations = await this.db.getRecentConversations();
      this.screen.updateThreadList(conversations);

      // If there are conversations, load the most recent one
      if (conversations.length > 0) {
        await this.loadThread(conversations[0].id);
      }

      // Show startup animation
      await this.screen.showStartupAnimation();

      // Set initial focus
      this.screen.focus();

      logger.info("Controller started successfully");
    } catch (error) {
      logger.error("Failed to start controller:", error);
      throw error;
    }
  }

  async handleMessage(content) {
    if (this.isProcessingMessage) return;

    try {
      this.isProcessingMessage = true;
      this.screen.startLoading();

      // Create new conversation if needed
      if (!this.currentConversationId) {
        this.currentConversationId = await this.db.createConversation();
        const conversations = await this.db.getRecentConversations();
        this.screen.updateThreadList(conversations);
      }

      // Save user message
      await this.db.saveMessage({
        conversationId: this.currentConversationId,
        role: "user",
        content,
      });
      this.screen.appendMessage("user", content);

      // Generate AI response
      const response = await this.ai.generateResponse(
        await this.db.getConversationHistory(this.currentConversationId),
        { stream: true }
      );

      // Save AI response
      await this.db.saveMessage({
        conversationId: this.currentConversationId,
        role: "assistant",
        content: response.content,
        model: response.model,
        tokenCount: response.tokenUsage.total,
      });

      // Update UI
      this.screen.appendMessage("assistant", response.content);
      this.screen.updateStatus({
        mode: this.currentMode,
        tokens: response.tokenUsage.total,
      });
    } catch (error) {
      logger.error("Error handling message:", error);
      this.screen.showError("Failed to process message");
    } finally {
      this.isProcessingMessage = false;
      this.screen.stopLoading();
    }
  }

  async loadThread(threadId) {
    try {
      this.currentConversationId = threadId;
      const messages = await this.db.getConversationHistory(threadId);
      const conversation = await this.db.getConversation(threadId);

      this.screen.clearChat();
      messages.forEach((msg) => {
        this.screen.appendMessage(msg.role, msg.content);
      });

      this.screen.updateTitle(conversation.title);

      // Update thread list with current selection
      const conversations = await this.db.getRecentConversations();
      this.screen.updateThreadList(conversations, threadId);
    } catch (error) {
      logger.error("Error loading thread:", error);
      this.screen.showError("Failed to load conversation");
    }
  }

  async shutdown() {
    logger.info("Beginning shutdown sequence");
    try {
      // Close database connection
      await this.db.close();

      // Clean up AI client if needed
      await this.ai.cleanup();

      // Clear screen
      this.screen.destroy();

      logger.info("Shutdown completed successfully");
    } catch (error) {
      logger.error("Error during shutdown:", error);
      throw error;
    }
  }
}

export { Controller };
