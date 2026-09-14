import { writeFile } from "node:fs/promises";
import { encodeFallbackHero } from "./hero-image-encoder.mjs";

const [, , sourcePath, outputPath, maxDimensionValue, qualityValue] = process.argv;
const maxDimension = Number(maxDimensionValue);
const quality = Number(qualityValue);
if (!sourcePath || !outputPath || !Number.isInteger(maxDimension) || !Number.isInteger(quality)) {
  throw new Error("Invalid hero image encoder arguments.");
}
const { data, info } = await encodeFallbackHero(sourcePath, maxDimension, quality);
await writeFile(outputPath, data);
process.stdout.write(JSON.stringify({ format: info.format, width: info.width, height: info.height }));
