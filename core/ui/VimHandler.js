import { EventEmitter } from "events";
import { logger } from "../../utils/Logger.js";

// Mode indicators for status line
const MODE_INDICATORS = {
  normal: "█ NORMAL",
  insert: "▲ INSERT",
  visual: "◆ VISUAL",
  command: "❯ COMMAND",
  search: "／ SEARCH",
};

class VimHandler extends EventEmitter {
  constructor(screen) {
    super();
    this.screen = screen;
    this.mode = "normal";
    this.commandBuffer = "";
    this.searchBuffer = "";
    this.lastSearch = "";
    this.visualStart = null;
    this.visualEnd = null;
    this.yankRegister = "";
    this.lastCommand = null;
    this.marks = new Map();

    // Command mode history
    this.commandHistory = [];
    this.commandHistoryIndex = -1;

    this.setupHandlers();
    this.updateStatusLine();
  }

  setupHandlers() {
    this.screen.screen.on("keypress", (ch, key) => {
      if (!key) return;

      try {
        switch (this.mode) {
          case "normal":
            this.handleNormalMode(ch, key);
            break;
          case "insert":
            this.handleInsertMode(ch, key);
            break;
          case "visual":
            this.handleVisualMode(ch, key);
            break;
          case "command":
            this.handleCommandMode(ch, key);
            break;
          case "search":
            this.handleSearchMode(ch, key);
            break;
        }

        this.updateStatusLine();
      } catch (error) {
        logger.error("Error handling keypress:", error);
        this.screen.showError(`Key handling error: ${error.message}`);
      }
    });
  }

  handleNormalMode(ch, key) {
    switch (key.full) {
      // Mode switches
      case "i":
        this.setMode("insert");
        break;
      case "v":
        this.setMode("visual");
        this.visualStart = this.screen.chatBox.getScroll();
        break;
      case ":":
        this.setMode("command");
        this.commandBuffer = ":";
        break;
      case "/":
        this.setMode("search");
        this.searchBuffer = "/";
        break;

      // Navigation
      case "j":
      case "down":
        this.screen.chatBox.scroll(1);
        break;
      case "k":
      case "up":
        this.screen.chatBox.scroll(-1);
        break;
      case "g g":
        this.screen.chatBox.scrollTo(0);
        break;
      case "G":
        this.screen.chatBox.scrollTo(this.screen.chatBox.getScrollHeight());
        break;
      case "ctrl-d":
        this.screen.chatBox.scroll(this.screen.chatBox.height / 2);
        break;
      case "ctrl-u":
        this.screen.chatBox.scroll(-this.screen.chatBox.height / 2);
        break;

      // Thread navigation
      case "H":
        this.emit("previousThread");
        break;
      case "L":
        this.emit("nextThread");
        break;

      // Marks
      case "m":
        this.waitForMarkKey((markKey) => {
          this.marks.set(markKey, this.screen.chatBox.getScroll());
          logger.debug(`Set mark '${markKey}'`);
        });
        break;
      case "'":
        this.waitForMarkKey((markKey) => {
          const pos = this.marks.get(markKey);
          if (pos !== undefined) {
            this.screen.chatBox.scrollTo(pos);
            logger.debug(`Jumped to mark '${markKey}'`);
          }
        });
        break;

      // Yank/Paste
      case "y y":
        this.yankCurrentLine();
        break;
      case "p":
        this.paste();
        break;
    }

    this.screen.screen.render();
  }

  handleInsertMode(ch, key) {
    if (key.full === "escape") {
      this.setMode("normal");
      return;
    }

    // Let normal input handling take over
    this.emit("input", ch);
  }

  handleVisualMode(ch, key) {
    if (key.full === "escape") {
      this.setMode("normal");
      this.visualStart = null;
      this.visualEnd = null;
      return;
    }

    this.visualEnd = this.screen.chatBox.getScroll();

    switch (key.full) {
      case "y":
        this.yankSelection();
        this.setMode("normal");
        break;
      case "d":
        this.deleteSelection();
        this.setMode("normal");
        break;
    }
  }

  handleCommandMode(ch, key) {
    switch (key.full) {
      case "escape":
        this.setMode("normal");
        this.commandBuffer = "";
        break;
      case "enter":
        this.executeCommand(this.commandBuffer);
        this.commandHistory.push(this.commandBuffer);
        this.commandHistoryIndex = this.commandHistory.length;
        this.setMode("normal");
        this.commandBuffer = "";
        break;
      case "backspace":
        this.commandBuffer = this.commandBuffer.slice(0, -1);
        break;
      case "up":
        if (this.commandHistoryIndex > 0) {
          this.commandHistoryIndex--;
          this.commandBuffer = this.commandHistory[this.commandHistoryIndex];
        }
        break;
      case "down":
        if (this.commandHistoryIndex < this.commandHistory.length - 1) {
          this.commandHistoryIndex++;
          this.commandBuffer = this.commandHistory[this.commandHistoryIndex];
        }
        break;
      default:
        if (ch) this.commandBuffer += ch;
    }

    this.updateStatusLine();
  }

  handleSearchMode(ch, key) {
    switch (key.full) {
      case "escape":
        this.setMode("normal");
        this.searchBuffer = "";
        break;
      case "enter":
        this.lastSearch = this.searchBuffer.slice(1);
        this.executeSearch(this.lastSearch);
        this.setMode("normal");
        this.searchBuffer = "";
        break;
      case "backspace":
        this.searchBuffer = this.searchBuffer.slice(0, -1);
        break;
      default:
        if (ch) this.searchBuffer += ch;
    }

    this.updateStatusLine();
  }

  executeCommand(command) {
    const cmd = command.slice(1); // Remove the :
    logger.debug("Executing command:", cmd);

    const parts = cmd.split(" ");
    switch (parts[0]) {
      case "q":
      case "quit":
        this.emit("quit");
        break;
      case "w":
      case "write":
        this.emit("save");
        break;
      case "model":
        this.emit("modelChange", parts[1]);
        break;
      case "thread":
        this.emit("threadChange", parseInt(parts[1]));
        break;
      case "help":
        this.showHelp();
        break;
      default:
        this.screen.showError(`Unknown command: ${parts[0]}`);
    }
  }

  executeSearch(query) {
    this.emit("search", query);
  }

  setMode(mode) {
    const oldMode = this.mode;
    this.mode = mode;
    this.emit("modeChange", mode);
    logger.debug(`Mode changed: ${oldMode} -> ${mode}`);
    this.updateStatusLine();
  }

  updateStatusLine() {
    let statusContent = MODE_INDICATORS[this.mode];

    if (this.mode === "command") {
      statusContent += ` ${this.commandBuffer}`;
    } else if (this.mode === "search") {
      statusContent += ` ${this.searchBuffer}`;
    }

    this.screen.updateStatus({ mode: this.mode, content: statusContent });
  }

  showHelp() {
    const helpContent = `
╔════════════════ Vim Commands ════════════════╗
║ Navigation:                                  ║
║   j/k     - Scroll up/down                  ║
║   gg/G    - Top/bottom                      ║
║   ctrl-u/d- Half page up/down               ║
║                                             ║
║ Modes:                                      ║
║   i       - Insert mode                     ║
║   v       - Visual mode                     ║
║   :       - Command mode                    ║
║   /       - Search mode                     ║
║                                             ║
║ Commands:                                   ║
║   :q      - Quit                           ║
║   :w      - Save                           ║
║   :model  - Change AI model                ║
║   :thread - Switch thread                  ║
║                                             ║
║ Marks:                                      ║
║   m{a-z}  - Set mark                       ║
║   '{a-z}  - Jump to mark                   ║
╚═════════════════════════════════════════════╝
    `;

    this.screen.showHelp(helpContent);
  }
}

// module.exports = { VimHandler };
export { VimHandler };
