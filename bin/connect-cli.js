#!/usr/bin/env node

const path = require("path");
const os = require("os");
const fs = require("fs").promises;
const { program } = require("commander");
const { Controller } = require("../dist/core/Controller");
const { Config } = require("../dist/utils/Config");
const { version } = require("../package.json");

// Default paths
const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".config", "connect-cli");
const DEFAULT_DATA_DIR = path.join(
  os.homedir(),
  ".local",
  "share",
  "connect-cli"
);
const DEFAULT_CONFIG_PATH = path.join(DEFAULT_CONFIG_DIR, "config.yaml");
const DEFAULT_DB_PATH = path.join(DEFAULT_DATA_DIR, "conversations.db");

async function ensureDirectories() {
  await fs.mkdir(DEFAULT_CONFIG_DIR, { recursive: true });
  await fs.mkdir(DEFAULT_DATA_DIR, { recursive: true });
}

program
  .name("connect-cli")
  .description("Cyberpunk-inspired terminal client for AI chat")
  .version(version)
  .option("-c, --config <path>", "config file path", DEFAULT_CONFIG_PATH)
  .option("--db <path>", "database file path", DEFAULT_DB_PATH)
  .option("-d, --debug", "enable debug logging")
  .action(async (options) => {
    try {
      await ensureDirectories();

      const config = await Config.load(options.config);

      // Override database path if specified
      if (options.db) {
        config.database.path = options.db;
      }

      // Set debug logging if enabled
      if (options.debug) {
        config.system.logLevel = "debug";
      }

      const controller = new Controller(config);
      await controller.initialize();
      await controller.start();
    } catch (error) {
      console.error("Failed to start connect-cli:", error);
      process.exit(1);
    }
  });

program
  .command("init")
  .description("Initialize configuration")
  .action(async () => {
    try {
      await ensureDirectories();

      // Create default config if it doesn't exist
      if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
        const defaultConfig = {
          ai: {
            defaultModel: "openai/gpt-3.5-turbo",
          },
          database: {
            path: DEFAULT_DB_PATH,
          },
          ui: {
            theme: "cyberpunk",
          },
          system: {
            logLevel: "info",
          },
        };

        await fs.writeFile(
          DEFAULT_CONFIG_PATH,
          require("yaml").stringify(defaultConfig)
        );

        console.log(`Configuration created at ${DEFAULT_CONFIG_PATH}`);
        console.log("Please add your OpenRouter API key to complete setup");
      } else {
        console.log("Configuration already exists");
      }
    } catch (error) {
      console.error("Failed to initialize:", error);
      process.exit(1);
    }
  });

program.parse();
