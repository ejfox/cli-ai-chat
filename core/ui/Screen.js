import blessed from "neo-blessed";
import { EventEmitter } from "events";
import { logger } from "../../utils/Logger.js";

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
    this.screen = null;
    this.selectedThread = 0;
  }

  async initialize() {
    try {
      // Create screen with minimal options first
      this.screen = blessed.screen({
        smartCSR: true,
        input: process.stdin,
        output: process.stdout,
        terminal: 'xterm',
        fullUnicode: true,
        autoPadding: true,
        title: 'ConnectCLI',
        debug: false,  // Disable debug output
        warnings: false  // Disable warnings
      });

      // Handle Ctrl+C properly
      this.screen.program.on('keypress', (ch, key) => {
        if (key && key.ctrl && key.name === 'c') {
          this.emit('quit');
          return;
        }
      });

      // Prevent blessed from taking over error handling
      this.screen.program.on('error', (err) => {
        logger.error('Terminal error:', err);
      });

      // Create main layout
      this.createLayout();

      // Set up key bindings
      this.setupKeys();

      // Initial render
      this.screen.render();

      logger.debug('Screen initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize screen:', error);
      throw error;
    }
  }

  createLayout() {
    // Sidebar for threads
    this.threadList = blessed.list({
      parent: this.screen,
      left: 0,
      top: 0,
      width: "30%",
      height: "100%-2",
      border: {
        type: 'line'
      },
      style: {
        selected: {
          bg: 'blue'
        },
        border: {
          fg: 'white'
        }
      },
      keys: true,
      vi: true,
      mouse: true,
      label: ' Threads '
    });

    // Main chat area
    this.chatBox = blessed.box({
      parent: this.screen,
      left: "30%",
      top: 0,
      width: "70%",
      height: "100%-2",
      border: {
        type: 'line'
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      label: ' Conversation ',
      scrollbar: {
        style: {
          bg: 'white'
        }
      }
    });

    // Status bar
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 1,
      content: ' NORMAL ',
      style: {
        fg: 'white',
        bg: 'blue'
      }
    });

    // Input box
    this.inputBox = blessed.textarea({
      parent: this.screen,
      bottom: 1,
      left: 0,
      width: "100%",
      height: 1,
      inputOnFocus: true,
      style: {
        fg: 'white'
      }
    });
  }

  setupKeys() {
    // Quit on Ctrl+C
    this.screen.key(['C-c'], () => {
      this.emit('quit');
    });

    // Input handling
    this.inputBox.key('enter', async () => {
      const message = this.inputBox.getValue();
      if (message.trim()) {
        this.inputBox.clearValue();
        this.screen.render();
        this.emit('message', message.trim());
      }
    });

    // Focus handling
    this.inputBox.key(['escape'], () => {
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
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
    }

    if (this.screen) {
      // Remove all listeners
      this.screen.program.input.removeAllListeners();
      this.screen.program.output.removeAllListeners();
      
      // Restore terminal state
      this.screen.program.disableMouse();
      this.screen.program.showCursor();
      this.screen.program.normalBuffer();
      
      // Clear screen
      this.screen.leave();
      this.screen.destroy();
    }

    // Restore terminal
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  clearChat() {
    if (this.chatBox) {
      this.chatBox.setContent('');
      this.screen.render();
    }
  }

  updateTitle(title) {
    if (this.chatBox) {
      this.chatBox.setLabel(` ╒═══ ${title} ═══╕ `);
      this.screen.render();
    }
  }

  showHelp(content) {
    const helpBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: '80%',
      content: content,
      border: {
        type: 'line',
        fg: '#666'
      },
      style: {
        border: {
          fg: '#666'
        }
      },
      scrollable: true,
      keys: true,
      vi: true
    });

    helpBox.key(['escape', 'q'], () => {
      helpBox.destroy();
      this.screen.render();
    });

    this.screen.render();
  }
}

export { Screen };
