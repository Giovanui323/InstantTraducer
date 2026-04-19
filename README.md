# iTraducer

Electron-based desktop application for translating PDF documents while preserving the original layout structure. The system combines OCR-based page analysis with large language models to produce page-by-page translations that maintain visual fidelity with the source document.

---

## Project Overview

iTraducer is designed as a bilingual book reproduction tool: given a PDF input, it produces a translated counterpart where each page mirrors the structure, dimensions, and annotation placement of the original. Translation is performed on a per-page basis using multimodal AI models that analyze the rendered page image directly, rather than relying on extracted text alone. This approach preserves footnotes, sidebars, and complex multi-column layouts that traditional text-extraction pipelines cannot handle.

The application manages a local library of translation projects, each identified by a UUID-based file ID. Project state (translations, annotations, verification results, user highlights and notes) is persisted to disk via an asynchronous save queue with priority-based debouncing. A built-in verification system evaluates translation quality and can suggest corrections through an automated feedback loop.

---

## System Architecture

The application follows a standard Electron two-process architecture:

```
+-------------------+       IPC (ipcMain/ipcRenderer)       +-------------------+
|   Renderer Process | <----------------------------------> |   Main Process     |
|   (React + Vite)   |                                     |   (Node.js)        |
|                    |                                     |                    |
|  - PDF rendering   |                                     |  - File system I/O |
|  - Translation UI  |                                     |  - PDF operations  |
|  - State management|                                     |  - Settings store  |
|  - AI API calls    |                                     |  - Write sequencer |
+-------------------+                                       +-------------------+
         |
         | HTTPS
         v
+-------------------+
|   AI Providers    |
|  - Google Gemini  |
|  - OpenAI         |
|  - Anthropic      |
|  - Groq           |
+-------------------+
```

**Renderer Process**: A React 19 single-page application compiled with Vite. PDF rendering is handled client-side via `pdfjs-dist`. AI API calls are initiated from the renderer using provider-specific SDKs (`@google/genai`, `@anthropic-ai/sdk`). The translation queue, save queue, and verification pipeline are managed through a set of composable React hooks.

**Main Process**: Handles file system operations (project CRUD, image storage, PDF manipulation), settings persistence, and application lifecycle. A write sequencer ensures serialized disk writes to prevent data corruption. Fingerprint-based deduplication prevents importing the same PDF twice.

**IPC Boundary**: Communication between processes uses Electron's `ipcMain`/`ipcRenderer` with a typed `electronAPI` bridge exposed on the `window` object. Operations include `loadTranslation`, `saveTranslation`, `deleteTranslation`, `exportProjectPackage`, and file dialog interactions.

---

## Core Functionalities

- **Multimodal Page Translation**: Each page is rendered to a JPEG image and sent to the configured AI model along with a structured translation prompt. The model returns the translated text while preserving structural elements (headings, footnotes, captions).

- **Priority-Based Save Queue**: All project mutations are routed through `SaveQueueManager`, which implements priority levels (`CRITICAL`, `BACKGROUND`, `BATCH`), deduplication by file ID, debounce timers per priority, and automatic retry on transient failures. Critical saves are flushed immediately; background saves are debounced at 30 seconds.

- **Save Blocking Manager**: During project transitions (open, close, rename), a blocking mechanism temporarily prevents saves to avoid race conditions. Blocks are time-bounded with automatic release and backend synchronization.

- **Multi-Provider Support**: The translation and verification pipelines support multiple AI providers (Gemini, OpenAI, Anthropic, Groq) with per-provider model lists and automatic fallback chains. Cooldown tracking prevents repeated calls to rate-limited models.

- **Translation Verification**: An optional quality verification pass evaluates completed translations using a separate model. Verification results include severity ratings and correction suggestions. The verification queue runs independently from the translation queue.

- **Library Management**: UUID-based project identification with fingerprint deduplication. Projects can be organized into named groups. Library state is refreshed from disk with preservation of in-memory projects that have pending saves.

- **Synchronized PDF Rendering**: The reader view renders original PDF pages side-by-side with translations using `pdfjs-dist` canvas rendering. Supports single-page, spread, and auto-split views with per-page rotation and crop tools.

- **Annotation System**: User highlights (with color coding) and text notes are stored per page and persisted as part of the project state. Annotations support precise character-level offsets for accurate positioning.

- **Export**: Translated content can be exported as a standalone PDF (via `jspdf`), as a project package (for import on another machine), or as the original PDF file.

---

## Technical Stack

| Component | Technology | Version |
|---|---|---|
| Framework | React | 19.2 |
| Language | TypeScript | 5.8 |
| Build Tool | Vite | 6.2 |
| Desktop Runtime | Electron | 39.2 |
| PDF Rendering | pdfjs-dist | 5.4.624 |
| Styling | Tailwind CSS | 3.4 |
| AI SDK (Gemini) | @google/genai | 1.35 |
| AI SDK (Anthropic) | @anthropic-ai/sdk | 0.88 |
| Testing | Vitest | 2.1 |
| Packaging | electron-builder | 26.4 |
| PDF Export | jspdf | 2.5 |

---

## Installation and Deployment

### Prerequisites

- Node.js >= 18
- npm >= 9

### Local Development

```bash
# Clone the repository
git clone https://github.com/Giovanui323/iTraducer.git
cd iTraducer

# Install dependencies
npm install

# Configure API keys (see Environment Variables section)
cp .env.local.example .env.local
# Edit .env.local with your API keys

# Start the development environment (Vite dev server + Electron)
npm run electron:dev
```

### Production Build

```bash
# Build the Vite frontend
npm run build

# Generate application icons
npm run generate:icons

# Package for macOS (Apple Silicon)
npm run package:mac:arm64

# Package for macOS (DMG installer)
npm run package:mac:arm64:dmg
```

The packaged application is output to the `release/` directory.

### Running Tests

```bash
# Run the full test suite
npm test

# Run a specific test file
npx vitest run tests/criticalFlows.test.ts

# Run with coverage report
npx vitest run --coverage
```

---

## Environment Variables

Configuration is provided through a `.env.local` file in the project root. This file is not committed to version control.

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key for translation and verification |
| `LOG_LEVEL` | No | Application log verbosity. Accepted values: `debug`, `info`, `warn`, `error`. Defaults to `info`. |

Additional provider API keys are configured at runtime through the application settings interface:

| Setting | Description |
|---|---|
| OpenAI API Key | Required for OpenAI models (o1, o3, GPT-4o) |
| Anthropic API Key | Required for Claude models |
| Groq API Key | Required for Groq-hosted models |

These runtime keys are stored in the Electron `userData` directory via `electron-store` and are not written to `.env.local`.

---

## Project Structure

```
src/
  components/        React UI components (ReaderView, Header, HomeView, etc.)
  constants.ts       Application-wide constants (models, timeouts, prompts)
  contexts/          React context providers (LibraryContext)
  hooks/
    library/         Extracted hooks: GroupManager, SaveBlockingManager
    saveQueue/       SaveQueueManager with priority queue and deduplication
    useAppLibrary.ts Main library orchestration hook
    useAppTranslation.ts  Translation queue and page-level translation logic
    useAppQuality.ts      Verification and quality assessment pipeline
    useAppAnnotations.ts  Highlight and note management
  services/
    geminiService.ts      Gemini API integration with cooldown and retry
    geminiCooldown.ts     Per-model and global cooldown tracking
    geminiModelLogic.ts   Fallback chain resolution
    usageTracker.ts       Token and cost tracking per project
  types.ts           TypeScript type definitions
  utils/
    saveQueueUtils.ts     mergeSaveDelta, buildProjectSavePayload
    idUtils.ts            UUID validation and project ID normalization
    textUtils.ts          Column splitting and text processing

electron/
  main.js            Application entry point, window management
  projectHandlers.js Project CRUD operations
  pdfHandlers.js     PDF file reading and manipulation
  settingsLogic.js   Settings persistence
  writeSequencer.js  Serialized write operations with timeout protection
  fileUtils.js       File system utilities and directory management

tests/               Vitest test files
```

---

## License

This project is licensed under the MIT License.
