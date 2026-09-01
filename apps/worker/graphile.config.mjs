import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export default {
  worker: {
    taskDirectory: join(currentDirectory, "dist", "tasks"),
    crontabFile: join(currentDirectory, "crontab"),
    gracefulShutdownAbortTimeout: 30_000,
  },
};
