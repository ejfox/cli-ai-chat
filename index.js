import blessed from 'blessed';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import axios from 'axios';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(os.homedir(), '.config', 'cli-ai-chat');
const AGENT_DIR = path.join(CONFIG_DIR, 'agents');
const PLUGIN_DIR = path.join(__dirname, 'plugins');

// Default configurations
const DEFAULT_CONFIG = {
  default_provider: 'openai',
  default_agent: 'default',
  providers: {
    openai: {
      api_key: 'YOUR_API_KEY_HERE',
      default_model: 'gpt-3.5-turbo'
    }
  }
};

const DEFAULT_UI_CONFIG = {
  colors: {
    chat_text: 'white',
    input_text: 'white',
    input_bg: 'blue',
    status_text: 'white',
    status_bg: 'green'
  }
};

const DEFAULT_AGENT_CONFIG = {
  name: 'default',
  provider: 'openai',
  model: 'gpt-3.5-turbo',
  system_prompt: 'You are a helpful assistant.',
  response_generation: {
    temperature: 0.7,
    max_tokens: 1000
  }
};

// Load configurations with fallback to defaults
const loadConfig = async (file, defaultConfig) => {
  try {
    return yaml.load(await fs.readFile(path.join(CONFIG_DIR, file), 'utf8'));
  } catch (error) {
    console.warn(`Warning: Could not load ${file}. Using default configuration.`);
    return defaultConfig;
  }
};

const loadAgentConfigs = async () => {
  try {
    const files = await fs.readdir(AGENT_DIR);
    const configs = {};
    for (const file of files) {
      if (file.endsWith('.yaml')) {
        const agentName = path.basename(file, '.yaml');
        configs[agentName] = yaml.load(await fs.readFile(path.join(AGENT_DIR, file), 'utf8'));
      }
    }
    return Object.keys(configs).length > 0 ? configs : { default: DEFAULT_AGENT_CONFIG };
  } catch (error) {
    console.warn('Warning: Could not load agent configurations. Using default agent.');
    return { default: DEFAULT_AGENT_CONFIG };
  }
};

// Load provider plugins with error handling
const loadProviderPlugin = async (providerName) => {
  try {
    const pluginPath = path.join(PLUGIN_DIR, `${providerName}.js`);
    return await import(pluginPath);
  } catch (error) {
    console.error(`Error loading provider plugin ${providerName}: ${error.message}`);
    console.error(`Make sure the plugin file exists at: ${path.join(PLUGIN_DIR, `${providerName}.js`)}`);
    return null;
  }
};

// Initialize app
const initApp = async () => {
  const appConfig = await loadConfig('config.yaml', DEFAULT_CONFIG);
  //const uiConfig = await loadConfig('ui_config.yaml', DEFAULT_UI_CONFIG);
  const uiConfig = DEFAULT_UI_CONFIG;
  const agentConfigs = await loadAgentConfigs();

  // Initialize providers
  const providers = {};
  for (const [providerName, providerConfig] of Object.entries(appConfig.providers)) {
    const provider = await loadProviderPlugin(providerName);
    if (provider) {
      try {
        await provider.init(providerConfig);
        providers[providerName] = provider;
      } catch (error) {
        console.error(`Error initializing provider ${providerName}:`, error.message);
      }
    }
  }

  if (Object.keys(providers).length === 0) {
    console.error('No providers were successfully loaded. Please check your configuration and plugins.');
    process.exit(1);
  }

  return { appConfig, uiConfig, agentConfigs, providers };
};

// UI setup
const setupUI = (uiConfig) => {
  const s = blessed.screen({ smartCSR: true });
  const main = blessed.box({ parent: s, top: 0, left: 0, width: "100%", height: "100%" });
  const chatBox = blessed.box({
    parent: main,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%-3",
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    style: { fg: uiConfig.colors.chat_text },
  });
  const inputBox = blessed.textarea({
    parent: main,
    bottom: 0,
    left: 0,
    height: 3,
    width: "100%",
    inputOnFocus: true,
    padding: { top: 1, left: 2 },
    style: { fg: uiConfig.colors.input_text, bg: uiConfig.colors.input_bg },
  });
  const statusBar = blessed.text({
    parent: main,
    bottom: 3,
    left: 0,
    width: "100%",
    height: 1,
    style: { fg: uiConfig.colors.status_text, bg: uiConfig.colors.status_bg },
  });

  return { s, main, chatBox, inputBox, statusBar };
};

// Main application logic
const runApp = async () => {
  const { appConfig, uiConfig, agentConfigs, providers } = await initApp();
  const { s, chatBox, inputBox, statusBar } = setupUI(uiConfig);

  let currentAgent = appConfig.default_agent;
  let messages = [];

  const uStatus = () => {
    statusBar.setContent(` Agent: ${currentAgent} | Messages: ${messages.length} | Ctrl-C: Exit`);
    s.render();
  };

  const aMessage = (role, content) => {
    messages.push({ role, content });
    const prefix = role === "user" ? "{bold}{red}You:{/bold}" : "{bold}{yellow}AI:{/bold}";
    chatBox.pushLine(`${prefix} ${content}`);
    chatBox.setScrollPerc(100);
    uStatus();
  };

  const gResponse = async () => {
    try {
      aMessage("assistant", "Thinking...");
      
      const agentConfig = agentConfigs[currentAgent] || DEFAULT_AGENT_CONFIG;
      const provider = providers[agentConfig.provider];
      
      if (!provider) {
        throw new Error(`Provider ${agentConfig.provider} not available.`);
      }

      const formattedMessages = provider.formatMessages([
        { role: "system", content: agentConfig.system_prompt },
        ...messages
      ]);

      const response = await provider.generateResponse(formattedMessages, {
        model: agentConfig.model,
        ...agentConfig.response_generation
      });

      chatBox.setLine(-1, `{bold}{yellow}AI:{/bold} ${response.text}`);
      messages[messages.length - 1].content = response.text;
      
      chatBox.scrollTo(chatBox.getScrollHeight());
      s.render();
      uStatus();
    } catch (e) {
      aMessage("assistant", `Error: ${e.message}`);
    }
  };

  inputBox.key("enter", () => {
    const msg = inputBox.getValue().trim();
    if (msg.startsWith("/agent ")) {
      const newAgent = msg.slice(7).trim();
      if (agentConfigs[newAgent]) {
        currentAgent = newAgent;
        aMessage("system", `Switched to agent: ${newAgent}`);
      } else {
        aMessage("system", `Unknown agent: ${newAgent}. Available agents: ${Object.keys(agentConfigs).join(', ')}`);
      }
    } else if (msg) {
      aMessage("user", msg);
      gResponse();
    }
    inputBox.clearValue();
    s.render();
  });

  s.key(["escape", "C-c"], () => process.exit(0));

  uStatus();
  inputBox.focus();
  s.render();
};

// Run the application
runApp().catch(error => {
  console.error('Fatal error:', error);
  console.log('Please ensure all necessary configurations and plugins are in place.');
  process.exit(1);
});
