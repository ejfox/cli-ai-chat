# cli-ai-chat

A cyberpunk-inspired terminal client for AI chat with vim controls, built for developers who live in the terminal.

```bash
npm install -g cli-ai-chat
connect-cli
```

## Core Vision

Built for developers who want a powerful, keyboard-driven interface for AI interactions. Inspired by irssi, vim, and classic BBS systems, cli-ai-chat brings AI chat to the terminal with a focus on efficiency and extensibility.

### Key Design Principles
- **Terminal-First**: Built for developers who live in the command line
- **Keyboard-Driven**: Complete vim-style navigation and control
- **Threaded Conversations**: Branch and navigate complex discussion trees
- **Extensible**: Plugin system for custom features and AI models
- **Persistent**: Automatic SQLite-backed conversation storage
- **Efficient**: Native Node.js v23+ SQLite integration
- **Developer-Friendly**: File generation, code handling, and more

## Features

### Core Systems
- **Native SQLite**: Built on Node.js 23.1.0's SQLite integration
- **Thread Management**: Graph-based conversation storage
- **OpenRouter Integration**: Single API for multiple AI models
- **File Generation**: AI can save files via `<FileExport>` tags
- **Real-Time Streaming**: Smooth response streaming with indicators

### Interface
```
┌─ Threads ─┐┌─ Conversation ──────────────────┐
│           ││                                 │
│ Thread 1  ││ User: Help me with a React...  │
│ Thread 2  ││ AI: Let's break this down...   │
│           ││                                 │
│           ││                                 │
└───────────┘└─────────────────────────────────┘
[INSERT] Model: GPT-4 | Tokens: 150
```

- Vim navigation (j/k, gg/G, etc.)
- Command mode with fuzzy search
- Real-time response streaming
- Thread branching and navigation
- File save notifications

## Quick Start

```bash
# Install globally
npm install -g cli-ai-chat

# Initialize config
connect-cli init

# Add your OpenRouter API key to ~/.config/connect-cli/config.yaml
connect-cli
```

## Navigation

### Vim Controls
- `j/k`: Scroll up/down
- `g g`: Jump to top
- `G`: Jump to bottom
- `H/L`: Previous/next thread
- `:`: Command mode
- `/`: Search mode
- `i`: Insert mode
- `v`: Visual mode
- `m{a-z}`: Set mark
- `'{a-z}`: Jump to mark

### Commands
- `:model <name>`: Switch AI model
- `:thread [list|new|delete] [id]`: Thread management
- `:search <query>`: Search conversations
- `:write [filename]`: Save conversation
- `:help [command]`: Show help
- `:set <option> <value>`: Configure settings

## Architecture

### Core Components
```
src/
├── core/
│   ├── Controller.js   # Central application logic
│   ├── Database.js     # SQLite integration
│   └── AIClient.js     # OpenRouter/AI handling
├── ui/
│   ├── Screen.js       # Blessed UI components
│   └── VimHandler.js   # Vim navigation/modes
└── utils/
    ├── Commands.js     # Command processing
    ├── Config.js       # Configuration
    └── Logger.js       # Winston logging
```

### Configuration
```yaml
# ~/.config/connect-cli/config.yaml
ai:
  apiKey: "your_openrouter_key"
  defaultModel: "openai/gpt-3.5-turbo"
database:
  path: "~/.local/share/connect-cli/conversations.db"
ui:
  theme: "cyberpunk"
  animations: true
system:
  logLevel: "info"
```

### File Export Feature
AI can generate and save files:
```
<FileExport name="example.js">
console.log('Hello from the terminal!');
</FileExport>
```
Files are saved to `~/.local/share/connect-cli/exports/<conversation_id>/`.

## Development

### Requirements
- Node.js >= 23.1.0 (for native SQLite)
- npm or yarn

### Setup
```bash
# Clone
git clone https://github.com/your-username/cli-ai-chat.git
cd cli-ai-chat

# Install
npm install

# Build
npm run build

# Test
npm test
```

### Testing
- SQLite test database
- Mocked AI responses
- Blessed screen simulation
- Command processing tests

## Roadmap

- [ ] Plugin system for custom commands
- [ ] Multiple conversation views
- [ ] Advanced thread visualization
- [ ] Code execution sandbox
- [ ] Real-time collaboration
- [ ] Custom UI themes
- [ ] Enhanced vim features
- [ ] Cross-device sync

## Credits

Built with:
- [Blessed](https://github.com/chjj/blessed): Terminal UI
- [Node.js SQLite](https://nodejs.org/api/sqlite3.html): Native SQLite
- [OpenRouter](https://openrouter.ai/): AI model access
- [Winston](https://github.com/winstonjs/winston): Logging

## License

ISC

## Contributing

PRs welcome! Check out the issues for what's needed.