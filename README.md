# AI Chat CLI
An advanced, irssi-inspired CLI application for interacting with multiple AI language models in a threaded conversation format.

## Features
• Multi-Model Support: Interact with various AI models (e.g., GPT-3.5, Claude) within the same conversation.
• Threaded Conversations: Create and navigate complex conversation trees with user-initiated branching.
• Dynamic Model Switching: Change AI models on-the-fly, even within the same conversation thread.
• Vim-like Interface: Familiar, keyboard-driven navigation and command system.
• Powerful Search: Fuzzy search functionality for finding specific threads or content.
• Extensibility: User-defined scripts and customizations for enhanced functionality.
• Persistence: Automatic saving of all conversations for easy recall and continuation.
Architecture
• Language: Node.js (JavaScript)
• User Interface: Text-based UI (TUI) using the Blessed library
• Data Storage: SQLite database with a graph-like structure
• AI Integration: Plugin-based system for easy addition of new AI models
• Error Handling: Detailed logging with Winston, following standard Unix/CLI patterns
UI Layout
• Left sidebar (30% width): Thread/Channel list with vim-like file explorer
• Main view (70% width): Current conversation thread
• Bottom input area: For user messages and commands
• Status bar: Displaying current model, token usage, and other relevant information


## Key Concepts
1. Threaded Conversations:
• User-initiated branching
• Vim-like navigation (j/k for up/down, h/l for collapse/expand)
• Command-line options for creating and managing threads
2. AI Model Integration:
• Dynamic switching between models
• Custom system prompts for each model instance
• Model-to-model interactions within the same thread
3. Navigation:
• Command-line /slash commands
• Numbered shortcuts for quick thread switching
• Fuzzy search (fzf-style) for finding threads and content
4. Persistence and Data Management:
• Automatic saving of all conversations in SQLite database
• Graph-like data structure for efficient thread management
5. Extensibility:
• Support for user-defined scripts and customizations
• Plugin architecture for adding new features and AI models
6. Security:
• Secure handling of API keys through .env files or setup wizard
• Encryption of sensitive data at rest
7. Performance:
• Optimized for speed and responsiveness
• Efficient data structures and algorithms
• Techniques like lazy loading and local caching as needed


## Getting Started
(Instructions for installation, configuration, and basic usage will be added as the project develops)

## Configuration
• API keys can be added through .env files or using the built-in configuration wizard
• Detailed logs are available in error.log, following standard Unix/CLI patterns
Comprehensive Configuration Guide for AI Chat CLI
Welcome to the configuration guide for our irssi-style AI chat application. This document will walk you through all the possible configuration options, allowing you to customize the application to your specific needs.



### 1.1 Installation

```bash
git clone https://github.com/your-repo/ai-chat-cli.git
cd ai-chat-cli
npm install
```

### 1.2 Main Configuration File
Create a config.yaml file in the root directory:

app_name: "AI Chat CLI"
version: "1.0.0"
default_provider: "openai"
default_agent: "general-assistant"
data_directory: "./data"
log_level: "info"

### 2. Provider Configuration
Create a providers.yaml file in the config directory:

```yaml
providers:
  openai:
    api_key: ${OPENAI_API_KEY}
    base_url: "https://api.openai.com/v1"
    default_model: "gpt-3.5-turbo"
  anthropic:
    api_key: ${ANTHROPIC_API_KEY}
    base_url: "https://api.anthropic.com"
    default_model: "claude-2"
```

Add more providers as needed

### 3. Agent Configuration
For each agent, create a YAML file in the agents directory. Example: `agents/openai-code-expert.yaml`

```yaml
name: "Code Expert"
provider: "openai"
model: "gpt-4"
version: "1.0"

system_prompt: |
  You are an expert programmer proficient in multiple languages.
  Your task is to assist with code-related queries, debugging, and optimization.

context_management:
  max_tokens: 4000
  context_ratio: 0.8
  memory_type: "sliding_window"

response_generation:
  max_tokens: 1000
  temperature: 0.4
  top_p: 0.9

capabilities:
  code_execution: true
  web_search: false
  function_calling:
    method: "xml"
    command_syntax: "function:name(arg1, arg2)"
```



4. Plugin System
Create a plugins_config.yaml file in the config directory:

```yaml
enabled_plugins:
  - "code_executor"
  - "web_search"
  - "image_analyzer"

plugin_directories:
  - "./plugins"
  - "~/.ai-chat-cli/plugins"

auto_update_plugins: true

plugin_settings:
  code_executor:
    supported_languages:
      - "python"
      - "javascript"
      - "ruby"
    sandbox_environment: true
  web_search:
    search_engine: "duckduckgo"
    max_results: 5
```

---

Usage Tips
1. Environment Variables: Use environment variables for sensitive information like API keys. You can set these in a .env file in the root directory.
2. Customization: Start with the default configurations and gradually customize as you become familiar with the system.
3. Agent Specialization: Create specialized agents for different tasks (e.g., coding, writing, research) by fine-tuning their configurations.
4. Regular Updates: Keep your configuration files up to date as new features are added to the application.
5. Backup: Regularly backup your configuration files, especially before making significant changes.
6. Testing: After making changes, test the application thoroughly to ensure everything works as expected.
7. Community Configs: Check our community forum for shared configuration setups that might suit your needs.