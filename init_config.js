#!/usr/bin/env node

import inquirer from "inquirer";
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import chalk from "chalk";
import { DEFAULT_PATHS, ensureDirectories } from "./utils/paths.js";

async function promptMainConfig() {
  console.log(chalk.cyan("\nSetting up main configuration..."));
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "defaultProvider",
      message: "Enter the default AI provider:",
      default: "openai",
    },
    {
      type: "input",
      name: "defaultModel",
      message: "Enter the default model:",
      default: "gpt-3.5-turbo",
    },
    {
      type: "list",
      name: "theme",
      message: "Select the UI theme:",
      choices: ["dark", "light", "cyberpunk"],
      default: "cyberpunk",
    },
    {
      type: "list",
      name: "logLevel",
      message: "Select the log level:",
      choices: ["error", "warn", "info", "debug"],
      default: "info",
    },
  ]);

  return {
    ai: {
      defaultProvider: answers.defaultProvider,
      defaultModel: answers.defaultModel,
      maxTokens: 4096,
      temperature: 0.7,
      providers: {}
    },
    database: {
      path: DEFAULT_PATHS.DB_PATH,
      maxConnections: 10,
      enableWAL: true,
    },
    ui: {
      theme: answers.theme
    },
    system: {
      logLevel: answers.logLevel,
      logPath: path.join(DEFAULT_PATHS.DATA_DIR, "logs"),
    }
  };
}

async function promptProviderConfig(providerName) {
  console.log(
    chalk.cyan(`\nSetting up configuration for provider: ${providerName}`)
  );
  const answers = await inquirer.prompt([
    {
      type: "password",
      name: "apiKey",
      message: `Enter the API key for ${providerName}:`,
      validate: (input) => input.length > 0 || "API key cannot be empty",
    },
    {
      type: "input",
      name: "baseUrl",
      message: `Enter the base URL for ${providerName} API:`,
      default: providerName === "openai" ? "https://api.openai.com/v1" : "",
    }
  ]);

  return {
    apiKey: answers.apiKey,
    baseUrl: answers.baseUrl
  };
}

async function initConfig() {
  console.log(chalk.yellow("Welcome to the Connect CLI Configuration Wizard!"));
  console.log(
    chalk.yellow("We'll guide you through setting up your configuration.")
  );

  try {
    // Create necessary directories
    await ensureDirectories();

    // Get main configuration
    const config = await promptMainConfig();

    // Provider configuration
    const providers = {};
    let addAnotherProvider = true;

    while (addAnotherProvider) {
      const providerAnswer = await inquirer.prompt([
        {
          type: "input",
          name: "providerName",
          message: "Enter the provider name (or leave blank to finish):",
          default: config.ai.defaultProvider,
        },
      ]);

      if (!providerAnswer.providerName) {
        addAnotherProvider = false;
        break;
      }

      const providerConfig = await promptProviderConfig(
        providerAnswer.providerName
      );
      providers[providerAnswer.providerName] = providerConfig;

      const continueAnswer = await inquirer.prompt([
        {
          type: "confirm",
          name: "continue",
          message: "Do you want to add another provider?",
          default: false,
        },
      ]);

      addAnotherProvider = continueAnswer.continue;
    }

    config.ai.providers = providers;

    // Save configuration
    await fs.writeFile(
      DEFAULT_PATHS.CONFIG_PATH,
      yaml.dump(config)
    );

    // Create .env file with API keys
    const envContent = Object.entries(providers)
      .map(([name, config]) => `${name.toUpperCase()}_API_KEY=${config.apiKey}`)
      .join('\n');
    
    await fs.writeFile('.env', envContent);

    console.log(chalk.green("\nConfiguration complete!"));
    console.log(chalk.cyan(`Configuration saved to: ${DEFAULT_PATHS.CONFIG_PATH}`));
    console.log(chalk.cyan("API keys saved to: .env"));
    console.log(chalk.yellow("\nYou can now run 'connect-cli' to start the application."));
  } catch (error) {
    console.error(chalk.red("An error occurred during configuration:"));
    console.error(error);
    process.exit(1);
  }
}

initConfig();
