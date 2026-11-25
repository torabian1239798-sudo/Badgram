import sharp from "sharp";
import { mkdir } from "node:fs/promises";

await mkdir("assets", { recursive: true });
await sharp("assets/icon.svg").resize(1024, 1024).png().toFile("assets/icon.png");
await sharp("assets/icon.svg").resize(432, 432).png().toFile("assets/adaptive-icon.png");
console.log("Generated Badgram app icons.");
