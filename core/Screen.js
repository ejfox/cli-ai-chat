const blessed = require("blessed");
const { EventEmitter } = require("events");
const { logger } = require("../utils/Logger");

const ASCII_LOGO = `
╔═══════════════════════════════════════╗
║ ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐╔═╗╦  ╔═╗╔╦╗╦  ║
║ │  │ │││││││├┤ │   │ ╚═╗║  │ ││║║║  ║
║ └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ╚═╝╩═╝╚═╝╩ ╩╩  ║
╚═══════════════════════════════════════╝`;

const LOADING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

class Screen extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.loadingInterval = null;
    this.loadingFrame = 0;
  }

  initialize() {
    // Create blessed screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: "ConnectCLI",
      cursor: {
        artificial: true,
        shape: "line",
        blink: true,
        color: null,
      },
    });

    // Create main layout
    this.createLayout();

    // Set up key bindings
    this.setupKeys();

    // Initial render
    this.screen.render();

    // Show startup animation
    this.showStartupAnimation();
  }

  createLayout() {
    // Sidebar for threads
    this.threadList = blessed.box({
      parent: this.screen,
      left: 0,
      top: 0,
      width: "30%",
      height: "100%-2",
      label: " ╒═══ Threads ═══╕ ",
      border: {
        type: "line",
        fg: "#666",
      },
      style: {
        border: {
          fg: "#666",
        },
      },
    });

    // Main chat area
    this.chatBox = blessed.box({
      parent: this.screen,
      left: "30%",
      top: 0,
      width: "70%",
      height: "100%-2",
      label: " ╒═══ Conversation ═══╕ ",
      border: {
        type: "line",
        fg: "#666",
      },
      style: {
        border: {
          fg: "#666",
        },
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: "┃",
        track: {
          bg: "#000",
        },
        style: {
          inverse: true,
        },
      },
    });

    // Status bar
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 1,
      style: {
        fg: "#666",
        bg: "#000",
      },
    });

    // Input box
    this.inputBox = blessed.textbox({
      parent: this.screen,
      bottom: 1,
      left: 0,
      width: "100%",
      height: 1,
      inputOnFocus: true,
      style: {
        fg: "#00ff00",
      },
    });

    // Model indicator (top right)
    this.modelIndicator = blessed.box({
      parent: this.screen,
      right: 1,
      top: 0,
      width: 20,
      height: 1,
      content: "≣ GPT-3.5",
      style: {
        fg: "#666",
      },
    });
  }

  setupKeys() {
    // Quit on Ctrl-C or q
    this.screen.key(["C-c"], () => {
      this.emit("quit");
      return process.exit(0);
    });

    // Input handling
    this.inputBox.key("enter", async () => {
      const message = this.inputBox.getValue();
      if (message.trim()) {
        this.inputBox.clearValue();
        this.screen.render();
        this.emit("message", message.trim());
      }
    });

    // Focus handling
    this.inputBox.key(["escape"], () => {
      this.threadList.focus();
    });
  }

  async showStartupAnimation() {
    const box = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      width: 50,
      height: 10,
      content: ASCII_LOGO,
      style: {
        fg: "#00ff00",
      },
    });

    this.screen.render();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    box.destroy();
    this.screen.render();
  }

  startLoading(message = "Thinking") {
    if (this.loadingInterval) return;

    this.loadingInterval = setInterval(() => {
      const frame = LOADING_FRAMES[this.loadingFrame];
      this.statusBar.setContent(`${frame} ${message}...`);
      this.loadingFrame = (this.loadingFrame + 1) % LOADING_FRAMES.length;
      this.screen.render();
    }, 80);
  }

  stopLoading() {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
      this.statusBar.setContent("");
      this.screen.render();
    }
  }

  appendMessage(role, content, isStreaming = false) {
    const timestamp = new Date().toLocaleTimeString();
    const roleColor = role === "user" ? "#00ff00" : "#4d94ff";
    const prefix = role === "user" ? "┌── User" : "└── AI";

    this.chatBox.pushLine(`{${roleColor}-fg}${prefix} (${timestamp}){/}`);

    if (!isStreaming) {
      this.chatBox.pushLine(content);
      this.chatBox.pushLine(""); // Add spacing
    }

    this.chatBox.setScrollPerc(100);
    this.screen.render();
  }

  updateStreamingMessage(content) {
    // Find the last message and update it
    const lines = this.chatBox.getLines();
    if (lines.length > 0) {
      lines[lines.length - 1] = content;
      this.chatBox.setContent(lines.join("\n"));
      this.chatBox.setScrollPerc(100);
      this.screen.render();
    }
  }

  showError(message) {
    const box = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      width: "50%",
      height: 5,
      content: `╔═ ERROR ═╗\n${message}\n╚═══════╝`,
      border: {
        type: "line",
        fg: "red",
      },
      style: {
        fg: "red",
        border: {
          fg: "red",
        },
      },
    });

    this.screen.render();
    setTimeout(() => {
      box.destroy();
      this.screen.render();
    }, 3000);
  }

  updateThreadList(threads) {
    this.threadList.setContent(
      threads
        .map((t, i) => `${i === this.selectedThread ? "► " : "  "}${t.title}`)
        .join("\n")
    );
    this.screen.render();
  }

  updateStatus({ mode = "normal", tokens = 0 }) {
    const modeColor = {
      normal: "#666",
      insert: "#00ff00",
      command: "#ffff00",
    }[mode];

    this.statusBar.setContent(
      `{${modeColor}-fg}${mode.toUpperCase()}{/} │ Tokens: ${tokens}`
    );
    this.screen.render();
  }

  focus() {
    this.inputBox.focus();
  }

  destroy() {
    this.screen.destroy();
  }
}

module.exports = { Screen };
