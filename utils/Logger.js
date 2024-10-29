import winston from "winston";
import { ClickHouseClient } from "@clickhouse/client";
import path from "path";
import { promises as fs } from "fs";

// Custom ClickHouse transport for Winston
class ClickHouseTransport extends winston.Transport {
  constructor(opts) {
    super(opts);
    this.client = new ClickHouseClient({
      host: opts.host || "http://localhost:8123",
      database: opts.database || "ai_chat_cli",
      username: opts.username || "default",
      password: opts.password || "",
    });
    this.tableName = opts.tableName || "logs";
    this.batchSize = opts.batchSize || 100;
    this.batchTimeout = opts.batchTimeout || 5000;
    this.queue = [];
    this.timer = null;

    this.initializeClickHouse().catch((err) => {
      console.error("Failed to initialize ClickHouse:", err);
    });
  }

  async initializeClickHouse() {
    const query = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        timestamp DateTime,
        level String,
        message String,
        userId String,
        conversationId String,
        modelName String,
        tokenCount UInt32,
        responseTime UInt32,
        metadata String,
        environment String
      ) ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (timestamp, level)
    `;

    await this.client.query({ query });
  }

  async log(info, callback) {
    try {
      const logEntry = {
        timestamp: new Date(),
        level: info.level,
        message: info.message,
        userId: info.userId || "anonymous",
        conversationId: info.conversationId || "",
        modelName: info.modelName || "",
        tokenCount: info.tokenCount || 0,
        responseTime: info.responseTime || 0,
        metadata: JSON.stringify(info.metadata || {}),
        environment: process.env.NODE_ENV || "development",
      };

      this.queue.push(logEntry);

      if (this.queue.length >= this.batchSize) {
        await this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.batchTimeout);
      }

      callback();
    } catch (error) {
      console.error("Error in ClickHouse transport:", error);
      callback(error);
    }
  }

  async flush() {
    if (this.queue.length === 0) return;

    clearTimeout(this.timer);
    this.timer = null;

    const batch = this.queue.splice(0, this.batchSize);

    try {
      await this.client.insert({
        table: this.tableName,
        values: batch,
        format: "JSONEachRow",
      });
    } catch (error) {
      console.error("Failed to write to ClickHouse:", error);
      // Re-queue failed entries
      this.queue.unshift(...batch);
    }
  }
}

// Custom formatter that includes file and line number
const customFormat = winston.format.printf(
  ({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }

    // Add source location in development
    if (process.env.NODE_ENV === "development") {
      const error = new Error();
      const stackLine = error.stack.split("\n")[3];
      const match = stackLine.match(/\((.+):(\d+):(\d+)\)$/);
      if (match) {
        const [, file, line, col] = match;
        msg += ` (${path.basename(file)}:${line})`;
      }
    }

    return msg;
  }
);

class Logger {
  constructor(config) {
    this.config = config;
    this.initialized = false;
    this.logger = winston.createLogger({
      level: config.system.logLevel || 'info',
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
    this.initialized = true;
  }

  // Add fallback logging for when logger isn't initialized
  log(level, message, meta = {}) {
    if (!this.initialized) {
      console.log(`Logger not initialized ${message}`, meta);
      return;
    }
    this.logger[level](message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  // Add the missing warn method
  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  async initialize() {
    if (this.initialized) return;

    // Ensure log directory exists
    await fs.mkdir(this.config.system.logPath, { recursive: true });

    const transports = [
      // Console transport with color
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          customFormat
        ),
        level: process.env.NODE_ENV === "development" ? "debug" : "info",
      }),

      // File transport for all logs
      new winston.transports.File({
        filename: path.join(this.config.system.logPath, "combined.log"),
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        maxsize: this.parseSize(this.config.system.maxLogSize),
        maxFiles: this.config.system.maxLogFiles,
        tailable: true,
      }),

      // Separate error log
      new winston.transports.File({
        filename: path.join(this.config.system.logPath, "error.log"),
        level: "error",
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        maxsize: this.parseSize(this.config.system.maxLogSize),
        maxFiles: this.config.system.maxLogFiles,
        tailable: true,
      }),
    ];

    this.logger = winston.createLogger({
      level: this.config.system.logLevel,
      transports,
    });

    this.initialized = true;
  }

  parseSize(size) {
    const units = {
      b: 1,
      k: 1024,
      m: 1024 * 1024,
      g: 1024 * 1024 * 1024,
    };
    const match = size.toString().match(/^(\d+)([bkmg])?$/i);
    if (!match) throw new Error(`Invalid size format: ${size}`);
    const [, num, unit = 'b'] = match;
    return parseInt(num) * units[unit.toLowerCase()];
  }
}

// Create and export singleton instance
const logger = new Logger({
  system: {
    logLevel: process.env.LOG_LEVEL || "info",
    logPath: process.env.LOG_PATH || "./logs",
    maxLogSize: process.env.MAX_LOG_SIZE || "10m",
    maxLogFiles: parseInt(process.env.MAX_LOG_FILES || "5"),
  },
});

export { logger, Logger, ClickHouseTransport };
