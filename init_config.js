#!/usr/bin/env node

import inquirer from "inquirer";
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import chalk from "chalk";
import os from "os";

// Define constants for configuration directories
const CONFIG_DIR = path.join(os.homedir(), ".config", "ai-chat-cli");
const AGENT_DIR = path.join(CONFIG_DIR, "agents");
const PROVIDERS_DIR = path.join(CONFIG_DIR, "providers");

// Ensure directory exists
async function ensureDirectoryExists(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
    console.log(chalk.green(`Created directory: ${dir}`));
  } catch (err) {
    if (err.code !== "EEXIST") {
      console.error(
        chalk.red(`Failed to create directory ${dir}: ${err.message}`)
      );
      throw err;
    }
  }
}

// Write YAML file
async function writeYamlFile(filePath, data) {
  try {
    await fs.writeFile(filePath, yaml.dump(data), "utf8");
    console.log(chalk.green(`Wrote configuration to: ${filePath}`));
  } catch (err) {
    console.error(
      chalk.red(`Failed to write file ${filePath}: ${err.message}`)
    );
    throw err;
  }
}

// Prompt for main configuration
async function promptMainConfig() {
  console.log(chalk.cyan("\nSetting up main configuration..."));
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "appName",
      message: "Enter the application name:",
      default: "AI Chat CLI",
    },
    {
      type: "input",
      name: "version",
      message: "Enter the application version:",
      default: "1.0.0",
    },
    {
      type: "input",
      name: "defaultProvider",
      message: "Enter the default AI provider:",
      default: "openai",
    },
    {
      type: "input",
      name: "defaultAgent",
      message: "Enter the default agent name:",
      default: "general-assistant",
    },
    {
      type: "input",
      name: "dataDirectory",
      message: "Enter the data directory path:",
      default: path.join(CONFIG_DIR, "data"),
    },
    {
      type: "list",
      name: "logLevel",
      message: "Select the log level:",
      choices: ["error", "warn", "info", "verbose", "debug", "silly"],
      default: "info",
    },
  ]);

  return {
    app_name: answers.appName,
    version: answers.version,
    default_provider: answers.defaultProvider,
    default_agent: answers.defaultAgent,
    data_directory: answers.dataDirectory,
    log_level: answers.logLevel,
  };
}

// Prompt for provider configuration
async function promptProviderConfig(providerName) {
  console.log(
    chalk.cyan(`\nSetting up configuration for provider: ${providerName}`)
  );
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "apiKey",
      message: `Enter the API key for ${providerName}:`,
      validate: (input) => input.length > 0 || "API key cannot be empty",
    },
    {
      type: "input",
      name: "baseUrl",
      message: `Enter the base URL for ${providerName} API:`,
      default: providerName === "openai" ? "https://api.openai.com/v1" : "",
    },
    {
      type: "input",
      name: "defaultModel",
      message: `Enter the default model for ${providerName}:`,
      default: providerName === "openai" ? "gpt-3.5-turbo" : "",
    },
  ]);

  return {
    api_key: answers.apiKey,
    base_url: answers.baseUrl,
    default_model: answers.defaultModel,
  };
}

// Prompt for agent configuration
async function promptAgentConfig() {
  console.log(chalk.cyan("\nSetting up agent configuration..."));
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Enter the agent name:",
      default: "general-assistant",
    },
    {
      type: "input",
      name: "provider",
      message: "Which provider does this agent use?",
      default: "openai",
    },
    {
      type: "input",
      name: "model",
      message: "Enter the model for this agent:",
      default: "gpt-3.5-turbo",
    },
    {
      type: "editor",
      name: "systemPrompt",
      message: "Enter the system prompt for this agent:",
      default: "You are a helpful assistant.",
    },
    {
      type: "number",
      name: "maxTokens",
      message: "Enter the max tokens for responses:",
      default: 1000,
    },
    {
      type: "number",
      name: "temperature",
      message: "Enter the temperature for response generation (0.0 - 1.0):",
      default: 0.7,
    },
  ]);

  return {
    name: answers.name,
    provider: answers.provider,
    model: answers.model,
    system_prompt: answers.systemPrompt,
    response_generation: {
      max_tokens: answers.maxTokens,
      temperature: answers.temperature,
    },
  };
}

async function initConfig() {
  console.log(chalk.yellow("Welcome to the AI Chat CLI Configuration Wizard!"));
  console.log(
    chalk.yellow("We'll guide you through setting up your configuration.")
  );

  try {
    // Step 1: Create necessary directories
    console.log(chalk.cyan("\nStep 1: Creating necessary directories..."));
    await ensureDirectoryExists(CONFIG_DIR);
    await ensureDirectoryExists(AGENT_DIR);
    await ensureDirectoryExists(PROVIDERS_DIR);

    // Step 2: Main configuration
    console.log(chalk.cyan("\nStep 2: Setting up main configuration..."));
    const mainConfig = await promptMainConfig();

    // Step 3: Provider configuration
    console.log(chalk.cyan("\nStep 3: Setting up provider configuration..."));
    const providers = {};
    let addAnotherProvider = true;

    while (addAnotherProvider) {
      const providerAnswer = await inquirer.prompt([
        {
          type: "input",
          name: "providerName",
          message: "Enter the provider name (or leave blank to finish):",
          default: mainConfig.default_provider,
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

    mainConfig.providers = providers;

    // Step 4: Agent configuration
    console.log(chalk.cyan("\nStep 4: Setting up agent configuration..."));
    const agents = [];
    let addAnotherAgent = true;

    while (addAnotherAgent) {
      const agentConfig = await promptAgentConfig();
      agents.push(agentConfig);

      const continueAnswer = await inquirer.prompt([
        {
          type: "confirm",
          name: "continue",
          message: "Do you want to add another agent?",
          default: false,
        },
      ]);

      addAnotherAgent = continueAnswer.continue;
    }

    // Step 5: Saving configurations
    console.log(chalk.cyan("\nStep 5: Saving configurations..."));
    await writeYamlFile(path.join(CONFIG_DIR, "config.yaml"), mainConfig);

    for (const agentConfig of agents) {
      const agentFileName = `${agentConfig.name}.yaml`;
      await writeYamlFile(path.join(AGENT_DIR, agentFileName), agentConfig);
    }

    console.log(chalk.green("\nConfiguration complete!"));
    console.log(chalk.yellow("You can now run the AI Chat CLI. Enjoy!"));
  } catch (error) {
    console.error(chalk.red("An error occurred during configuration:"));
    console.error(error);
  }
}

initConfig();
