import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import { packRawEvidenceBatch } from "@nettiauto/domain";
import type { Task } from "graphile-worker";

const task: Task = async () => {
  const sql = createSqlClient(parseWorkerConfig().DATABASE_URL, 1);
  try {
    await packRawEvidenceBatch(sql, 250, true);
  } finally {
    await closeSqlClient(sql);
  }
};

export default task;
