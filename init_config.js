import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.config', 'cli-ai-chat');
const AGENT_DIR = path.join(CONFIG_DIR, 'agents');

async function ensureDirectoryExists(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
    console.log(chalk.green(`Created directory: ${dir}`));
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error(chalk.red(`Failed to create directory ${dir}: ${err.message}`));
      throw err;
    } else {
      console.log(chalk.yellow(`Directory already exists: ${dir}`));
    }
  }
}

async function writeYamlFile(filePath, data) {
  try {
    await fs.writeFile(filePath, yaml.dump(data), 'utf8');
    console.log(chalk.green(`Wrote configuration to: ${filePath}`));
  } catch (err) {
    console.error(chalk.red(`Failed to write file ${filePath}: ${err.message}`));
    throw err;
  }
}

async function promptMainConfig() {
  console.log(chalk.cyan('\nSetting up main configuration...'));
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'defaultProvider',
      message: 'Enter the default AI provider:',
      default: 'openai',
    },
    {
      type: 'input',
      name: 'defaultAgent',
      message: 'Enter the default agent name:',
      default: 'general-assistant',
    },
  ]);

  return {
    default_provider: answers.defaultProvider,
    default_agent: answers.defaultAgent,
    providers: {},
  };
}

async function promptProviderConfig(providerName) {
  console.log(chalk.cyan(`\nSetting up configuration for provider: ${providerName}`));
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiKey',
      message: `Enter the API key for ${providerName}:`,
      validate: input => input.length > 0 || 'API key cannot be empty',
    },
    {
      type: 'input',
      name: 'model',
      message: `Enter the default model for ${providerName}:`,
      default: providerName === 'openai' ? 'gpt-3.5-turbo' : 'claude-v1',
    },
  ]);

  return {
    api_key: answers.apiKey,
    default_model: answers.model,
  };
}

async function promptAgentConfig() {
  console.log(chalk.cyan('\nSetting up agent configuration...'));
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Enter the agent name:',
      default: 'general-assistant',
    },
    {
      type: 'input',
      name: 'provider',
      message: 'Which provider does this agent use?',
      default: 'openai',
    },
    {
      type: 'input',
      name: 'model',
      message: 'Enter the model for this agent:',
      default: 'gpt-3.5-turbo',
    },
    {
      type: 'input',
      name: 'systemPrompt',
      message: 'Enter the system prompt for this agent:',
      default: 'You are a helpful assistant.',
    },
  ]);

  return {
    name: answers.name,
    provider: answers.provider,
    model: answers.model,
    system_prompt: answers.systemPrompt,
    response_generation: {
      temperature: 0.7,
      max_tokens: 1000,
    },
  };
}

async function initConfig() {
  console.log(chalk.yellow('Welcome to the AI Chat CLI Configuration Wizard!'));
  console.log(chalk.yellow('We\'ll guide you through setting up your configuration.'));

  try {
    console.log(chalk.cyan('\nStep 1: Creating necessary directories...'));
    await ensureDirectoryExists(CONFIG_DIR);
    await ensureDirectoryExists(AGENT_DIR);

    console.log(chalk.cyan('\nStep 2: Setting up main configuration...'));
    const mainConfig = await promptMainConfig();

    console.log(chalk.cyan('\nStep 3: Setting up provider configuration...'));
    mainConfig.providers[mainConfig.default_provider] = await promptProviderConfig(mainConfig.default_provider);

    console.log(chalk.cyan('\nStep 4: Setting up agent configuration...'));
    const agentConfig = await promptAgentConfig();

    console.log(chalk.cyan('\nStep 5: Saving configurations...'));
    await writeYamlFile(path.join(CONFIG_DIR, 'config.yaml'), mainConfig);
    await writeYamlFile(path.join(AGENT_DIR, `${agentConfig.name}.yaml`), agentConfig);

    console.log(chalk.green('\nConfiguration complete!'));
    console.log(chalk.yellow('You can now run the AI Chat CLI. Enjoy!'));
  } catch (error) {
    console.error(chalk.red('An error occurred during configuration:'));
    console.error(error);
  }
}

initConfig();