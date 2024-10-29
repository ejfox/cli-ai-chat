#!/usr/bin/env node

import { Controller } from "./core/Controller.js";
import { Config } from "./utils/Config.js";
import { logger } from "./utils/Logger.js";

// Graceful shutdown handler
process.on("SIGINT", async () => {
  logger.info("Shutting down gracefully...");
  try {
    await controller.shutdown();
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
  process.exit(1);
});

async function main() {
  try {
    // Load configuration
    const config = await Config.load();

    // Initialize and start the application
    const controller = new Controller(config);
    await controller.initialize();

    // Log startup
    logger.info("AI Chat CLI started successfully");

    // Start the application
    await controller.start();
  } catch (error) {
    logger.error("Failed to start application:", error);
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  logger.error("Critical error:", error);
  process.exit(1);
});
