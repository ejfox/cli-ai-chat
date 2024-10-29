#!/usr/bin/env node

// Suppress punycode deprecation warning
process.noDeprecation = true;

import { Controller } from "./core/Controller.js";
import { Config } from "./utils/Config.js";
import { logger } from "./utils/Logger.js";

let controller = null;

// Graceful shutdown handler
process.on("SIGINT", async () => {
  logger.info("Shutting down gracefully...");
  try {
    if (controller) {
      await controller.shutdown();
    }
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
});

// Error handling for uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

// Error handling for unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

async function main() {
  try {
    // Load configuration
    const config = await Config.load();
    logger.info("Configuration loaded successfully");

    // Initialize and start the application
    controller = new Controller(config);
    await controller.initialize();
    
    // Keep the process alive until explicitly terminated
    try {
      await controller.start();
    } catch (error) {
      logger.error("Application error:", error);
      await controller.shutdown();
      process.exit(1);
    }

  } catch (error) {
    logger.error("Failed to start application:", error);
    if (controller) {
      await controller.shutdown();
    }
    process.exit(1);
  }
}

// Prevent the process from exiting due to unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the application
main().catch(async (error) => {
  logger.error("Critical error:", error);
  if (controller) {
    await controller.shutdown();
  }
  process.exit(1);
});
