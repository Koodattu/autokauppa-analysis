import sharp from "sharp";

export async function encodeFallbackHero(source, maxDimension = 480, quality = 60) {
  for (const [index, scale] of [1, 0.8, 0.65, 0.5, 0.33].entries()) {
    const dimension = Math.floor(maxDimension * scale);
    const encoded = await sharp(source)
      .rotate()
      .resize({ width: dimension, height: dimension, fit: "inside", withoutEnlargement: true })
      .webp({ quality: quality - index * 5, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    if (encoded.data.byteLength <= 20 * 1024) return encoded;
  }
  throw new Error("Hero image could not fit the 20 KiB storage budget.");
}
