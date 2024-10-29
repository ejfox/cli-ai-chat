import path from "path";
import os from "os";
import fs from "fs/promises";

export const DEFAULT_PATHS = {
  CONFIG_DIR: path.join(os.homedir(), ".config", "connect-cli"),
  DATA_DIR: path.join(os.homedir(), ".local", "share", "connect-cli"),
  get CONFIG_PATH() {
    return path.join(this.CONFIG_DIR, "config.yaml");
  },
  get DB_PATH() {
    return path.join(this.DATA_DIR, "conversations.db");
  }
};

export async function ensureDirectories() {
  await fs.mkdir(DEFAULT_PATHS.CONFIG_DIR, { recursive: true });
  await fs.mkdir(DEFAULT_PATHS.DATA_DIR, { recursive: true });
} 