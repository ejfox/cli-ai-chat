#!/usr/bin/env node

import fs from "fs/promises";
import { program } from "commander";
import { Controller } from "../core/Controller.js";
import { Config } from "../utils/Config.js";
import yaml from 'js-yaml';
import { DEFAULT_PATHS, ensureDirectories } from "../utils/paths.js";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get package.json version
const __filename = fileURLToPath(import.meta.url);
const packageJson = JSON.parse(
  await fs.readFile(new URL('../package.json', import.meta.url))
);

program
  .name("connect-cli")
  .description("Cyberpunk-inspired terminal client for AI chat")
  .version(packageJson.version)
  .option("-c, --config <path>", "config file path", DEFAULT_PATHS.CONFIG_PATH)
  .option("--db <path>", "database file path", DEFAULT_PATHS.DB_PATH)
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
      
      // Keep the process alive until explicitly terminated
      try {
        await controller.start();
      } catch (error) {
        console.error("Application error:", error);
        await controller.shutdown();
        process.exit(1);
      }
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
      if (!await fs.access(DEFAULT_PATHS.CONFIG_PATH).then(() => true).catch(() => false)) {
        const defaultConfig = {
          ai: {
            defaultModel: "openai/gpt-3.5-turbo",
          },
          database: {
            path: DEFAULT_PATHS.DB_PATH,
          },
          ui: {
            theme: "cyberpunk",
          },
          system: {
            logLevel: "info",
          },
        };

        await fs.writeFile(
          DEFAULT_PATHS.CONFIG_PATH,
          yaml.dump(defaultConfig)
        );

        console.log(`Configuration created at ${DEFAULT_PATHS.CONFIG_PATH}`);
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
