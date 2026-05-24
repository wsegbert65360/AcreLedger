#!/usr/bin/env node

/**
 * Vision — Send an image to a free vision model via OpenRouter.
 *
 * Usage:
 *   node vision.js <image_path> "<prompt>" [model]
 *
 * Requires OPENROUTER_API_KEY environment variable.
 * Falls back to OPENAI_API_KEY if OPENROUTER_API_KEY is not set.
 *
 * Default model: google/gemma-4-31b-it:free (free, vision-capable)
 */

import { readFileSync } from "fs";
import { extname } from "path";

const [,, imagePath, prompt, model] = process.argv;

if (!imagePath || !prompt) {
  console.error("Usage: node vision.js <image_path> \"<prompt>\" [model]");
  console.error("\nFree vision models on OpenRouter:");
  console.error("  google/gemma-4-31b-it:free          (default)");
  console.error("  google/gemma-4-26b-a4b-it:free");
  console.error("  nvidia/nemotron-nano-12b-v2-vl:free");
  console.error("  nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free");
  process.exit(1);
}

const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Error: OPENROUTER_API_KEY or OPENAI_API_KEY environment variable is not set.");
  process.exit(1);
}

const baseUrl = process.env.OPENROUTER_API_KEY
  ? "https://openrouter.ai/api/v1"
  : "https://api.openai.com/v1";

const selectedModel = model || "google/gemma-4-31b-it:free";

// Read and base64-encode the image
const imageBuffer = readFileSync(imagePath);
const ext = extname(imagePath).toLowerCase().replace(".", "");
const mimeType = ext === "jpg" ? "jpeg" : ext;
const base64 = imageBuffer.toString("base64");
const dataUrl = `data:image/${mimeType};base64,${base64}`;

const response = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: selectedModel,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" },
          },
        ],
      },
    ],
  }),
});

if (!response.ok) {
  const body = await response.text();
  console.error(`API error ${response.status}: ${body}`);
  process.exit(1);
}

const data = await response.json();
console.log(data.choices[0].message.content);
