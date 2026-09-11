import { parseWorkerConfig } from "@nettiauto/config";
import { createSqlClient } from "@nettiauto/db";
import { packLegacyImagesBatch, packRawEvidenceBatch, verifyLegacyImages, verifyRawEvidence } from "@nettiauto/domain";
import { runV2DetailStorageBatch } from "./tasks/backfill_nettiauto_v2_details";

// Explicit operator entry point, outside Graphile's automatically discovered tasks.
const operation = process.argv[2];
if (!["v2", "images", "raw", "verify-images", "verify-raw"].includes(operation ?? "")) {
  throw new Error("Specify v2, images, raw, verify-images or verify-raw");
}
const sql = createSqlClient(parseWorkerConfig().DATABASE_URL, 1);
let lastReport = 0;
function report(value: unknown, force = false) {
  if (force || Date.now() - lastReport >= 20000) {
    console.log(JSON.stringify(value));
    lastReport = Date.now();
  }
}
try {
  if (operation === "verify-images") {
    const rows = await verifyLegacyImages(sql, rows => report({ operation, rows }));
    report({ operation, rows, complete: true }, true);
  } else if (operation === "verify-raw") {
    const result = await verifyRawEvidence(sql, bundles => report({ operation, bundles }));
    report({ operation, ...result, complete: true }, true);
  } else {
    for (;;) {
      const result = operation === "v2" ? await runV2DetailStorageBatch(sql, 500)
        : operation === "images" ? await packLegacyImagesBatch(sql, 100) : await packRawEvidenceBatch(sql, 250);
      report(result, result.status !== "running");
      if (result.status === "partial") throw new Error("Storage migration has unresolved exceptions");
      if (result.status !== "running") break;
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
