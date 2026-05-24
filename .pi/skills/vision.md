---
name: vision
description: Analyze screenshots, UI images, diagrams, and photos using a vision model via OpenRouter. Use when images are attached to understand visual content, describe UI, extract text, diagnose errors, and suggest fixes.
---

# Vision — Image Understanding Skill

When screenshots, UI images, diagrams, or photos are attached, use the vision model automatically to understand them.

## Capabilities

- **Analyze** — general visual analysis of the image
- **Describe visible UI** — layout, components, state, hierarchy
- **Extract text** — read and transcribe all visible text
- **Diagnose errors** — identify error messages, stack traces, failed states
- **Suggest fixes** — propose solutions for identified issues

## Usage

```bash
node .pi/skills/vision.js "<image_path>" "<prompt>" [model]
```

### Default model

`google/gemma-4-31b-it:free` — 31B params, 262K context, best quality among free vision models.

### Other free vision models on OpenRouter

```
google/gemma-4-31b-it:free
google/gemma-4-26b-a4b-it:free
nvidia/nemotron-nano-12b-v2-vl:free
nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
```

## Prompts

### Analyze the image
```
Analyze this image in detail. Describe what you see, including any UI elements, text, layouts, colors, and context.
```

### Describe visible UI
```
Describe the visible UI in this screenshot. Identify all components, layout structure, navigation elements, content areas, and current state. Note any accessibility or usability observations.
```

### Extract text
```
Extract and transcribe all visible text from this image. Preserve the approximate layout and hierarchy. Include labels, headings, body text, button text, error messages, and any other readable content.
```

### Diagnose errors
```
Diagnose any errors or issues visible in this image. Identify error messages, warnings, stack traces, failed states, broken layouts, missing content, or anything that looks incorrect. Be thorough.
```

### Suggest fixes
```
Identify any problems in this image and suggest specific fixes. For UI issues, describe what should change. For error messages, explain the likely cause and solution. For code errors, suggest corrections.
```

## How it works

1. Reads the image file and encodes it as base64
2. Tries each free vision model in order until one succeeds (auto-fallback on 429/503)
3. Returns the model's description as plain text

If a specific model is passed as the 3rd argument, no fallback occurs.

## Requirements

- `OPENROUTER_API_KEY` environment variable must be set
- Falls back to `OPENAI_API_KEY` if `OPENROUTER_API_KEY` is not set
- Supported formats: JPG, PNG, GIF, WebP
