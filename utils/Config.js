const fs = require("fs").promises;
const yaml = require("js-yaml");
const path = require("path");
const dotenv = require("dotenv");
const { logger } = require("./Logger");

// Default configuration values
const DEFAULT_CONFIG = {
  database: {
    path: "./data/conversations.db",
    maxConnections: 10,
    enableWAL: true,
  },
  ai: {
    defaultProvider: "openai",
    defaultModel: "gpt-3.5-turbo",
    maxTokens: 4096,
    temperature: 0.7,
    providers: {
      openai: {
        baseUrl: "https://api.openai.com/v1",
        timeout: 30000,
        maxRetries: 3,
      },
      anthropic: {
        baseUrl: "https://api.anthropic.com",
        timeout: 30000,
        maxRetries: 3,
      },
    },
  },
  ui: {
    theme: {
      normal: {
        fg: "white",
        bg: "black",
      },
      insert: {
        fg: "black",
        bg: "green",
      },
      command: {
        fg: "black",
        bg: "yellow",
      },
    },
    layout: {
      sidebar: {
        width: "30%",
      },
      mainView: {
        scrollback: 1000,
      },
      statusBar: {
        height: 1,
      },
    },
    vim: {
      enabledModes: ["normal", "insert", "command"],
      shortcuts: {
        gg: "scrollTop",
        G: "scrollBottom",
        "/": "search",
        n: "nextSearchResult",
        N: "previousSearchResult",
      },
    },
  },
  system: {
    logLevel: "info",
    logPath: "./logs",
    maxLogSize: "10m",
    maxLogFiles: 5,
  },
};

class Config {
  constructor() {
    this.config = {};
    this.configPath = "";
    this.envPath = "";
  }

  static async load(configPath = "./config.yaml", envPath = ".env") {
    const config = new Config();
    await config.initialize(configPath, envPath);
    return config;
  }

  async initialize(configPath, envPath) {
    try {
      this.configPath = configPath;
      this.envPath = envPath;

      // Load environment variables
      await this.loadEnv();

      // Load and merge configurations
      await this.loadConfig();

      // Validate the configuration
      this.validate();

      logger.info("Configuration loaded successfully");
    } catch (error) {
      logger.error("Failed to load configuration:", error);
      throw new Error(`Configuration error: ${error.message}`);
    }
  }

  async loadEnv() {
    try {
      const envExists = await fs
        .access(this.envPath)
        .then(() => true)
        .catch(() => false);

      if (envExists) {
        dotenv.config({ path: this.envPath });
        logger.info("Loaded environment variables");
      } else {
        logger.warn(
          ".env file not found, using existing environment variables"
        );
      }
    } catch (error) {
      logger.error("Error loading .env file:", error);
      throw error;
    }
  }

  async loadConfig() {
    try {
      // Start with default configuration
      this.config = { ...DEFAULT_CONFIG };

      // Load user configuration if it exists
      const configExists = await fs
        .access(this.configPath)
        .then(() => true)
        .catch(() => false);

      if (configExists) {
        const userConfig = yaml.load(
          await fs.readFile(this.configPath, "utf8")
        );
        this.mergeConfigs(this.config, userConfig);
        logger.info("Loaded user configuration");
      } else {
        logger.warn("No user configuration found, using defaults");
        // Create default config file
        await this.saveDefaultConfig();
      }

      // Override with environment variables
      this.applyEnvironmentOverrides();
    } catch (error) {
      logger.error("Error loading configuration:", error);
      throw error;
    }
  }

  async saveDefaultConfig() {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(this.configPath, yaml.dump(DEFAULT_CONFIG), "utf8");
      logger.info("Created default configuration file");
    } catch (error) {
      logger.error("Error saving default configuration:", error);
      throw error;
    }
  }

  mergeConfigs(target, source) {
    for (const key in source) {
      if (typeof source[key] === "object" && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this.mergeConfigs(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  applyEnvironmentOverrides() {
    // Override AI provider keys
    if (process.env.OPENAI_API_KEY) {
      this.config.ai.providers.openai.apiKey = process.env.OPENAI_API_KEY;
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.config.ai.providers.anthropic.apiKey = process.env.ANTHROPIC_API_KEY;
    }

    // Override database path
    if (process.env.DB_PATH) {
      this.config.database.path = process.env.DB_PATH;
    }

    // Override log level
    if (process.env.LOG_LEVEL) {
      this.config.system.logLevel = process.env.LOG_LEVEL;
    }
  }

  validate() {
    // Required API keys
    const provider = this.config.ai.defaultProvider;
    if (!this.config.ai.providers[provider]?.apiKey) {
      throw new Error(`Missing API key for default provider: ${provider}`);
    }

    // Validate paths
    if (!path.isAbsolute(this.config.database.path)) {
      this.config.database.path = path.resolve(
        process.cwd(),
        this.config.database.path
      );
    }

    // Validate numeric values
    if (this.config.ai.maxTokens < 1) {
      throw new Error("maxTokens must be greater than 0");
    }

    // Validate theme colors
    const requiredModes = ["normal", "insert", "command"];
    for (const mode of requiredModes) {
      if (!this.config.ui.theme[mode]) {
        throw new Error(`Missing theme configuration for mode: ${mode}`);
      }
    }
  }

  get(path) {
    return path.split(".").reduce((obj, key) => obj?.[key], this.config);
  }

  getRequired(path) {
    const value = this.get(path);
    if (value === undefined) {
      throw new Error(`Required configuration missing: ${path}`);
    }
    return value;
  }
}

module.exports = { Config, DEFAULT_CONFIG };
