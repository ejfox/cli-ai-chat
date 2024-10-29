import { EventEmitter } from "events";
import { logger } from "./Logger.js";

// Command metadata for help and autocompletion
const COMMANDS = {
  quit: {
    aliases: ["q", "exit"],
    description: "Exit the application",
    usage: ":quit",
    category: "application",
  },
  write: {
    aliases: ["w", "save"],
    description: "Save current conversation",
    usage: ":write [filename]",
    category: "conversation",
  },
  model: {
    aliases: ["m"],
    description: "Switch AI model",
    usage: ":model <model-name>",
    args: ["model-name"],
    category: "ai",
    completion: {
      model: [
        "openai/gpt-3.5-turbo",
        "openai/gpt-4",
        "anthropic/claude-2",
        "google/palm-2",
        "meta-llama/llama-2-70b-chat",
      ],
    },
  },
  thread: {
    aliases: ["t"],
    description: "Switch or manage threads",
    usage: ":thread [list|new|delete] [id]",
    category: "conversation",
    subcommands: {
      list: { description: "List all threads" },
      new: { description: "Create new thread" },
      delete: { description: "Delete thread", args: ["thread-id"] },
    },
  },
  search: {
    aliases: ["s"],
    description: "Search conversations",
    usage: ":search <query>",
    args: ["query"],
    category: "conversation",
  },
  help: {
    aliases: ["h"],
    description: "Show help information",
    usage: ":help [command]",
    category: "application",
  },
  set: {
    aliases: [],
    description: "Set configuration options",
    usage: ":set <option> <value>",
    args: ["option", "value"],
    category: "application",
    completion: {
      option: ["temperature", "max_tokens", "theme"],
    },
  },
};

class CommandHandler extends EventEmitter {
  constructor(controller) {
    super();
    this.controller = controller;
    this.commandHistory = [];
    this.maxHistory = 100;
  }

  async execute(cmdString) {
    try {
      const { command, subcommand, args } = this.parseCommand(cmdString);
      logger.debug("Executing command:", { command, subcommand, args });

      // Add to history if it's a new command
      if (!this.commandHistory.includes(cmdString)) {
        this.commandHistory.unshift(cmdString);
        if (this.commandHistory.length > this.maxHistory) {
          this.commandHistory.pop();
        }
      }

      switch (command) {
        case "quit":
        case "q":
        case "exit":
          await this.controller.shutdown();
          process.exit(0);
          break;

        case "write":
        case "w":
        case "save":
          await this.handleSave(args[0]);
          break;

        case "model":
        case "m":
          await this.handleModelChange(args[0]);
          break;

        case "thread":
        case "t":
          await this.handleThreadCommand(subcommand, args);
          break;

        case "search":
        case "s":
          await this.handleSearch(args.join(" "));
          break;

        case "help":
        case "h":
          this.showHelp(args[0]);
          break;

        case "set":
          await this.handleSet(args[0], args[1]);
          break;

        default:
          throw new Error(`Unknown command: ${command}`);
      }

      logger.info("Command executed successfully:", cmdString);
    } catch (error) {
      logger.error("Command execution failed:", error);
      this.controller.screen.showError(error.message);
    }
  }

  parseCommand(cmdString) {
    // Remove leading : if present
    const cleaned = cmdString.startsWith(":") ? cmdString.slice(1) : cmdString;
    const parts = cleaned.trim().split(/\s+/);

    return {
      command: parts[0],
      subcommand: parts[1],
      args: parts.slice(1),
    };
  }

  async handleSave(filename) {
    if (!this.controller.currentConversationId) {
      throw new Error("No active conversation to save");
    }

    await this.controller.db.exportConversation(
      this.controller.currentConversationId,
      filename
    );

    this.controller.screen.showMessage("Conversation saved successfully");
  }

  async handleModelChange(modelName) {
    if (!modelName) {
      throw new Error("Model name required");
    }

    // Validate model name
    const availableModels = this.controller.ai.getAvailableModels();
    if (!availableModels.includes(modelName)) {
      throw new Error(
        `Invalid model: ${modelName}. Available models: ${availableModels.join(
          ", "
        )}`
      );
    }

    this.controller.ai.setModel(modelName);
    this.controller.screen.updateStatus({ model: modelName });
    this.controller.screen.showMessage(`Switched to model: ${modelName}`);
  }

  async handleThreadCommand(subcommand, args) {
    switch (subcommand) {
      case "list":
        const threads = await this.controller.db.getRecentConversations();
        this.controller.screen.showThreadList(threads);
        break;

      case "new":
        const newId = await this.controller.db.createConversation();
        await this.controller.loadThread(newId);
        break;

      case "delete":
        const threadId = parseInt(args[1]);
        if (isNaN(threadId)) {
          throw new Error("Invalid thread ID");
        }
        await this.controller.db.deleteConversation(threadId);
        this.controller.screen.showMessage(`Thread ${threadId} deleted`);
        break;

      default:
        // Treat as thread ID if no subcommand
        const id = parseInt(subcommand);
        if (isNaN(id)) {
          throw new Error("Invalid thread ID or subcommand");
        }
        await this.controller.loadThread(id);
    }
  }

  async handleSearch(query) {
    if (!query) {
      throw new Error("Search query required");
    }

    const results = await this.controller.db.searchConversations(query);
    this.controller.screen.showSearchResults(results);
  }

  async handleSet(option, value) {
    if (!option || !value) {
      throw new Error("Both option and value are required");
    }

    switch (option) {
      case "temperature":
        const temp = parseFloat(value);
        if (isNaN(temp) || temp < 0 || temp > 2) {
          throw new Error("Temperature must be between 0 and 2");
        }
        this.controller.ai.config.temperature = temp;
        break;

      case "max_tokens":
        const tokens = parseInt(value);
        if (isNaN(tokens) || tokens < 1) {
          throw new Error("Max tokens must be a positive integer");
        }
        this.controller.ai.config.maxTokens = tokens;
        break;

      case "theme":
        if (!["dark", "light", "cyberpunk"].includes(value)) {
          throw new Error("Invalid theme");
        }
        this.controller.screen.setTheme(value);
        break;

      default:
        throw new Error(`Unknown option: ${option}`);
    }

    this.controller.screen.showMessage(`Set ${option} to ${value}`);
  }

  showHelp(command) {
    if (command) {
      const cmd = COMMANDS[command];
      if (!cmd) {
        throw new Error(`Unknown command: ${command}`);
      }

      const helpText = `
╔════ Command Help ═════
║ ${cmd.usage}
║ 
║ ${cmd.description}
║ ${cmd.aliases.length ? `Aliases: ${cmd.aliases.join(", ")}` : ""}
${
  cmd.subcommands
    ? `║ \n║ Subcommands:\n${Object.entries(cmd.subcommands)
        .map(([name, sub]) => `║   ${name} - ${sub.description}`)
        .join("\n")}`
    : ""
}
╚════════════════════════`;

      this.controller.screen.showHelp(helpText);
    } else {
      // Show general help
      const helpText = `
╔════ Available Commands ════════════════════════════════
║
${Object.entries(COMMANDS)
  .map(([name, cmd]) => `║ ${cmd.usage.padEnd(30)} ${cmd.description}`)
  .join("\n")}
║
║ Type :help <command> for detailed information
╚═══════════════════════════════════════════════════════`;

      this.controller.screen.showHelp(helpText);
    }
  }

  getCompletions(partial) {
    const [cmd, ...args] = partial.slice(1).split(/\s+/);

    // Complete command names
    if (!args.length) {
      return Object.entries(COMMANDS)
        .flatMap(([name, cmd]) => [name, ...cmd.aliases])
        .filter((name) => name.startsWith(cmd))
        .map((name) => ":" + name);
    }

    // Complete command arguments
    const command = COMMANDS[cmd];
    if (!command?.completion) return [];

    const argIndex = args.length - 1;
    const argName = Object.keys(command.completion)[argIndex];
    if (!argName) return [];

    return command.completion[argName]
      .filter((value) => value.startsWith(args[argIndex]))
      .map((value) => `:${cmd} ${args.slice(0, -1).join(" ")} ${value}`.trim());
  }
}

// module.exports = { CommandHandler };
export { CommandHandler };
