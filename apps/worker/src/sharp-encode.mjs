import sharp from "sharp";

const [, , sourcePath, outputPath, maxDimensionValue, qualityValue] = process.argv;
const maxDimension = Number(maxDimensionValue);
const quality = Number(qualityValue);
if (!sourcePath || !outputPath || !Number.isInteger(maxDimension) || !Number.isInteger(quality)) {
  throw new Error("Invalid hero image encoder arguments.");
}

const info = await sharp(sourcePath)
  .rotate()
  .resize({
    width: maxDimension,
    height: maxDimension,
    fit: "inside",
    withoutEnlargement: true,
  })
  .webp({ quality, effort: 4 })
  .toFile(outputPath);

process.stdout.write(JSON.stringify({ format: info.format, width: info.width, height: info.height }));
