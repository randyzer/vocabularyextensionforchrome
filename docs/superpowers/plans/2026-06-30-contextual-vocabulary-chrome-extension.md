# Contextual Vocabulary Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first Manifest V3 Chrome extension that looks up a hovered English word, pronounces it, saves its source sentence, and delivers a weekly local digest through Chrome notifications and a side panel.

**Architecture:** WXT builds a vanilla TypeScript extension. A user-authorized unlisted script runs in web pages and communicates with a stateless MV3 service worker; the service worker owns dictionary lookup, TTS, IndexedDB writes, alarms, and notifications. A side-panel SPA reads and mutates data only through typed runtime messages.

**Tech Stack:** Node.js 20+, pnpm, WXT, TypeScript, vanilla DOM, Chrome Manifest V3 APIs, `idb`, Zod, ECDICT mini, Vitest, Happy DOM, fake-indexeddb, Playwright Chromium.

---

## Delivery milestones

1. **Milestone A — Risk proof:** unpacked extension builds, receives optional host permission, detects a hovered word and sentence, and renders an isolated tooltip.
2. **Milestone B — Usable capture loop:** offline dictionary, TTS, IndexedDB capture, deduplication, undo, and side-panel vocabulary list work end to end.
3. **Milestone C — Complete MVP:** settings, weekly digest, notifications, import/export/delete, optional sentence translation, E2E tests, privacy documentation, and distributable ZIP.

## File map

```text
.
├── entrypoints/
│   ├── background.ts                  # MV3 service-worker entrypoint
│   ├── hover.ts                       # unlisted page script registered after permission
│   └── sidepanel/
│       ├── index.html                 # Chrome side-panel entrypoint
│       ├── main.ts                    # panel startup and route selection
│       └── style.css                  # panel-only styles
├── public/
│   └── dictionary/
│       ├── index.json                 # generated shard index
│       ├── a.json ... _.json          # generated ECDICT mini shards
│       └── LICENSE                    # ECDICT MIT license
├── scripts/
│   └── build-dictionary.mjs           # CSV-to-runtime-shard build tool
├── src/
│   ├── background/
│   │   ├── alarm-service.ts           # weekly alarm creation and recovery
│   │   ├── content-registration.ts    # optional permission and script registration
│   │   ├── digest-service.ts          # idempotent weekly digest generation
│   │   ├── message-handler.ts         # validated request router
│   │   ├── notification-service.ts    # system notification and click routing
│   │   ├── panel-navigation.ts        # pending digest and side-panel opening
│   │   └── speech-service.ts          # chrome.tts adapter
│   ├── content/
│   │   ├── hover-controller.ts        # timers and cancellation state machine
│   │   ├── index.ts                   # content runtime composition
│   │   ├── target-at-point.ts         # DOM point-to-text lookup
│   │   ├── text-segmentation.ts       # token and sentence extraction
│   │   └── tooltip.ts                 # Shadow DOM tooltip
│   ├── dictionary/
│   │   ├── engine.ts                  # shard loader and lookup orchestration
│   │   ├── normalize.ts               # word normalization and inflection fallback
│   │   └── types.ts                   # dictionary runtime types
│   ├── shared/
│   │   ├── constants.ts               # stable IDs and timing constants
│   │   ├── messages.ts                # request/response schemas and types
│   │   ├── models.ts                  # Capture, Digest, Settings types
│   │   └── validation.ts              # capture/import input validation
│   ├── sidepanel/
│   │   ├── api.ts                     # runtime message client
│   │   ├── app.ts                     # navigation and view mounting
│   │   ├── components/
│   │   │   └── capture-card.ts        # safe sentence highlighting
│   │   ├── translator.ts              # optional browser Translator adapter
│   │   └── views/
│   │       ├── current.ts              # unreported captures
│   │       ├── digests.ts              # digest history/detail
│   │       ├── settings.ts             # permissions and local settings
│   │       └── vocabulary.ts           # lemma-grouped library
│   └── storage/
│       ├── capture-repository.ts       # capture CRUD and dedupe
│       ├── database.ts                 # IndexedDB schema
│       ├── digest-repository.ts        # digest CRUD and period uniqueness
│       ├── portability-service.ts      # export/import/clear
│       └── settings-repository.ts      # chrome.storage.local settings
├── tests/
│   ├── e2e/
│   │   ├── fixtures.ts                 # persistent Chromium extension context
│   │   ├── hover-capture.spec.ts       # browser capture journey
│   │   ├── privacy.spec.ts             # form exclusion and no business network
│   │   └── weekly-digest.spec.ts       # notification-to-panel journey
│   ├── fixtures/
│   │   └── article.html                # deterministic English test page
│   ├── integration/
│   │   ├── message-handler.test.ts
│   │   └── repositories.test.ts
│   └── unit/
│       ├── digest-service.test.ts
│       ├── hover-controller.test.ts
│       ├── normalize.test.ts
│       ├── portability-service.test.ts
│       ├── settings.test.ts
│       └── text-segmentation.test.ts
├── THIRD_PARTY_NOTICES.md
├── PRIVACY.md
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── vitest.config.ts
└── wxt.config.ts
```

## Task 1: Initialize the repository and WXT build

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wxt.config.ts`
- Create: `vitest.config.ts`
- Create: `entrypoints/background.ts`
- Create: `entrypoints/hover.ts`
- Create: `entrypoints/sidepanel/index.html`
- Create: `entrypoints/sidepanel/main.ts`
- Create: `entrypoints/sidepanel/style.css`

- [ ] **Step 1: Initialize Git and pnpm**

Run:

```bash
git init
pnpm init
```

Expected: `.git/` and `package.json` are created without errors.

- [ ] **Step 2: Install the minimal runtime and development dependencies**

Run:

```bash
pnpm add idb zod
pnpm add -D wxt typescript vitest happy-dom fake-indexeddb @playwright/test csv-parse @types/node
```

Expected: `pnpm-lock.yaml` is created and all packages install successfully. If network access is blocked, request approval before retrying this exact command.

- [ ] **Step 3: Add scripts and TypeScript configuration**

Set `package.json` scripts to:

```json
{
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "pnpm build && playwright test",
    "dict:build": "node scripts/build-dictionary.mjs",
    "postinstall": "wxt prepare"
  }
}
```

Create `tsconfig.json`:

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "types": ["node", "vitest/globals"]
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['fake-indexeddb/auto'],
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
  },
});
```

- [ ] **Step 4: Configure the generated Manifest V3**

Create `wxt.config.ts`:

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: '语境生词本',
    description: '悬停查词、保存原句并生成每周本地复习周报。',
    permissions: [
      'storage',
      'alarms',
      'notifications',
      'tts',
      'sidePanel',
      'scripting',
    ],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: '打开语境生词本',
    },
  },
});
```

- [ ] **Step 5: Add minimal entrypoints**

Create `entrypoints/background.ts`:

```ts
export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    console.info('Context Vocabulary installed');
  });
});
```

Create `entrypoints/hover.ts`:

```ts
export default defineUnlistedScript(() => {
  document.documentElement.dataset.contextVocabularyLoaded = 'true';
});
```

Create `entrypoints/sidepanel/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>语境生词本</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <main id="app" aria-live="polite"></main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

Create `entrypoints/sidepanel/main.ts`:

```ts
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root');
root.textContent = '语境生词本正在初始化';
```

Create `entrypoints/sidepanel/style.css`:

```css
:root {
  color-scheme: light dark;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
  min-width: 320px;
}

#app {
  padding: 16px;
}
```

- [ ] **Step 6: Ignore generated files and verify the build**

Create `.gitignore`:

```gitignore
node_modules/
.output/
.wxt/
test-results/
playwright-report/
data/source/
.DS_Store
```

Run:

```bash
pnpm typecheck
pnpm build
```

Expected: both commands exit 0 and `.output/chrome-mv3/manifest.json` contains Manifest V3, `side_panel`, required permissions, and optional host permissions.

- [ ] **Step 7: Commit the foundation**

```bash
git add .
git commit -m "chore: initialize local vocabulary extension"
```

## Task 2: Define shared models, settings, and validated messages

**Files:**
- Create: `src/shared/constants.ts`
- Create: `src/shared/models.ts`
- Create: `src/shared/messages.ts`
- Create: `src/shared/validation.ts`
- Create: `src/storage/settings-repository.ts`
- Test: `tests/unit/settings.test.ts`

- [ ] **Step 1: Write failing tests for default and sanitized settings**

Create `tests/unit/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/storage/settings-repository';

describe('settings', () => {
  it('defaults to enabled local behavior and Monday 09:00', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      enabled: true,
      autoSpeak: true,
      speechRate: 1,
      saveSource: true,
      notificationHour: 9,
      notificationMinute: 0,
    });
  });

  it('clamps invalid speech and notification values', () => {
    expect(sanitizeSettings({
      speechRate: 9,
      notificationHour: -3,
      notificationMinute: 80,
    })).toMatchObject({
      speechRate: 2,
      notificationHour: 0,
      notificationMinute: 59,
    });
  });
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run:

```bash
pnpm vitest run tests/unit/settings.test.ts
```

Expected: FAIL because `settings-repository` does not exist.

- [ ] **Step 3: Add stable constants and domain models**

Create `src/shared/constants.ts`:

```ts
export const HOVER_DELAY_MS = 500;
export const AUTO_SAVE_DELAY_MS = 1_000;
export const UNDO_WINDOW_MS = 5_000;
export const TOOLTIP_CLOSE_DELAY_MS = 200;
export const CONTENT_SCRIPT_ID = 'context-vocabulary-hover';
export const WEEKLY_ALARM_NAME = 'weekly-digest';
export const PENDING_DIGEST_KEY = 'pendingDigestId';
export const SETTINGS_KEY = 'settings';
export const SCHEMA_VERSION = 1;
export const OPTIONAL_ORIGINS = ['http://*/*', 'https://*/*'];
```

Create `src/shared/models.ts` with the exact interfaces from the approved spec plus request inputs:

```ts
export type LookupStatus = 'found' | 'not_found';

export interface DictionaryEntry {
  lemma: string;
  phonetic?: string;
  partOfSpeech?: string[];
  definitionsZh: string[];
  frequencyRank?: number;
}

export interface Capture {
  id: string;
  surfaceWord: string;
  normalizedWord: string;
  lemma: string;
  phonetic?: string;
  partOfSpeech?: string[];
  definitionsZh: string[];
  sentence: string;
  wordStart: number;
  wordEnd: number;
  sourceTitle: string;
  sourceUrl: string;
  sourceOrigin: string;
  createdAt: number;
  lastSeenAt: number;
  encounterCount: number;
  mastered: boolean;
  masteredKey: 0 | 1;
  lookupStatus: LookupStatus;
  dedupeKey: string;
}

export interface SaveCaptureResult {
  capture: Capture;
  savedAt: number;
}

export interface WeeklyDigest {
  id: string;
  periodStart: number;
  periodEnd: number;
  generatedAt: number;
  captureIds: string[];
  wordCount: number;
  sentenceCount: number;
  notificationShownAt?: number;
}

export interface Settings {
  enabled: boolean;
  autoSpeak: boolean;
  speechRate: number;
  saveSource: boolean;
  notificationHour: number;
  notificationMinute: number;
  disabledOrigins: string[];
  hostPermissionOnboardingComplete: boolean;
  schemaVersion: number;
}

export interface SaveCaptureInput {
  surfaceWord: string;
  sentence: string;
  wordStart: number;
  wordEnd: number;
  sourceTitle: string;
  sourceUrl: string;
}

export interface CaptureFilter {
  from?: number;
  to?: number;
  lemma?: string;
  mastered?: boolean;
}

export interface ExportPayload {
  version: 1;
  exportedAt: number;
  captures: Capture[];
  digests: WeeklyDigest[];
  settings: Settings;
}
```

- [ ] **Step 4: Implement settings defaults and sanitization**

Create `src/storage/settings-repository.ts`:

```ts
import { SCHEMA_VERSION, SETTINGS_KEY } from '../shared/constants';
import type { Settings } from '../shared/models';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  autoSpeak: true,
  speechRate: 1,
  saveSource: true,
  notificationHour: 9,
  notificationMinute: 0,
  disabledOrigins: [],
  hostPermissionOnboardingComplete: false,
  schemaVersion: SCHEMA_VERSION,
};

export function sanitizeSettings(input: Partial<Settings>): Settings {
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_SETTINGS.enabled,
    autoSpeak: typeof input.autoSpeak === 'boolean'
      ? input.autoSpeak
      : DEFAULT_SETTINGS.autoSpeak,
    saveSource: typeof input.saveSource === 'boolean'
      ? input.saveSource
      : DEFAULT_SETTINGS.saveSource,
    speechRate: Math.min(2, Math.max(0.5, input.speechRate ?? 1)),
    notificationHour: Math.min(23, Math.max(0, Math.trunc(input.notificationHour ?? 9))),
    notificationMinute: Math.min(59, Math.max(0, Math.trunc(input.notificationMinute ?? 0))),
    disabledOrigins: [...new Set(input.disabledOrigins ?? [])]
      .filter((origin) => /^https?:\/\/[^/]+$/.test(origin)),
    hostPermissionOnboardingComplete:
      typeof input.hostPermissionOnboardingComplete === 'boolean'
        ? input.hostPermissionOnboardingComplete
        : DEFAULT_SETTINGS.hostPermissionOnboardingComplete,
    schemaVersion: SCHEMA_VERSION,
  };
}

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return sanitizeSettings(
    (stored[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {},
  );
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const settings = sanitizeSettings({ ...(await getSettings()), ...patch });
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}
```

- [ ] **Step 5: Define runtime-valid message contracts**

Create `src/shared/messages.ts`:

```ts
import { z } from 'zod';
import type {
  Capture,
  CaptureFilter,
  ExportPayload,
  SaveCaptureInput,
  Settings,
  WeeklyDigest,
} from './models';

const saveCaptureInputSchema = z.object({
  surfaceWord: z.string().min(1).max(80),
  sentence: z.string().min(1).max(2_000),
  wordStart: z.number().int().nonnegative(),
  wordEnd: z.number().int().positive(),
  sourceTitle: z.string().max(500),
  sourceUrl: z.string().url().max(4_096),
});

const settingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  autoSpeak: z.boolean().optional(),
  speechRate: z.number().optional(),
  saveSource: z.boolean().optional(),
  notificationHour: z.number().optional(),
  notificationMinute: z.number().optional(),
  disabledOrigins: z.array(z.string()).optional(),
  hostPermissionOnboardingComplete: z.boolean().optional(),
}).strict();

export const extensionRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('LOOKUP_WORD'), word: z.string().min(1).max(80) }),
  z.object({ type: z.literal('SPEAK_WORD'), word: z.string().min(1).max(80) }),
  z.object({ type: z.literal('SAVE_CAPTURE'), payload: saveCaptureInputSchema }),
  z.object({
    type: z.literal('UNDO_CAPTURE'),
    captureId: z.string().uuid(),
    savedAt: z.number(),
  }),
  z.object({
    type: z.literal('LIST_CAPTURES'),
    filter: z.object({
      from: z.number().optional(),
      to: z.number().optional(),
      lemma: z.string().optional(),
      mastered: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal('UPDATE_CAPTURE'),
    id: z.string().uuid(),
    mastered: z.boolean(),
  }),
  z.object({ type: z.literal('DELETE_CAPTURE'), id: z.string().uuid() }),
  z.object({ type: z.literal('LIST_DIGESTS') }),
  z.object({ type: z.literal('GET_DIGEST'), digestId: z.string().uuid() }),
  z.object({ type: z.literal('GET_SETTINGS') }),
  z.object({ type: z.literal('SAVE_SETTINGS'), patch: settingsPatchSchema }),
  z.object({ type: z.literal('SYNC_CONTENT_REGISTRATION') }),
  z.object({ type: z.literal('EXPORT_DATA') }),
  z.object({ type: z.literal('IMPORT_DATA'), payload: z.unknown() }),
  z.object({ type: z.literal('CLEAR_ALL_DATA') }),
  z.object({ type: z.literal('OPEN_CAPTURE_PANEL') }),
]);

export type ExtensionRequest =
  | { type: 'LOOKUP_WORD'; word: string }
  | { type: 'SPEAK_WORD'; word: string }
  | { type: 'SAVE_CAPTURE'; payload: SaveCaptureInput }
  | { type: 'UNDO_CAPTURE'; captureId: string; savedAt: number }
  | { type: 'LIST_CAPTURES'; filter: CaptureFilter }
  | { type: 'UPDATE_CAPTURE'; id: string; mastered: boolean }
  | { type: 'DELETE_CAPTURE'; id: string }
  | { type: 'LIST_DIGESTS' }
  | { type: 'GET_DIGEST'; digestId: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; patch: Partial<Settings> }
  | { type: 'SYNC_CONTENT_REGISTRATION' }
  | { type: 'EXPORT_DATA' }
  | { type: 'IMPORT_DATA'; payload: unknown }
  | { type: 'CLEAR_ALL_DATA' }
  | { type: 'OPEN_CAPTURE_PANEL' };

export type ExtensionResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

export type PanelData =
  | Capture[]
  | WeeklyDigest[]
  | Settings
  | ExportPayload;
```

Create `src/shared/validation.ts`:

```ts
export function assertWordOffset(sentence: string, word: string, start: number, end: number): void {
  if (start < 0 || end <= start || end > sentence.length) {
    throw new Error('INVALID_WORD_OFFSET');
  }
  if (sentence.slice(start, end).toLocaleLowerCase() !== word.toLocaleLowerCase()) {
    throw new Error('WORD_OFFSET_MISMATCH');
  }
}
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
pnpm vitest run tests/unit/settings.test.ts
pnpm typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit shared contracts**

```bash
git add src tests/unit/settings.test.ts
git commit -m "feat: define extension contracts and settings"
```

## Task 3: Implement word targeting and sentence extraction

**Files:**
- Create: `src/content/text-segmentation.ts`
- Create: `src/content/target-at-point.ts`
- Test: `tests/unit/text-segmentation.test.ts`

- [ ] **Step 1: Write failing token and sentence tests**

Create `tests/unit/text-segmentation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  extractSentenceTarget,
  isIgnoredElement,
  normalizeSentence,
} from '../../src/content/text-segmentation';

describe('text segmentation', () => {
  it('keeps apostrophes and hyphens inside English words', () => {
    const text = "A well-known idea isn't automatically correct.";
    expect(extractSentenceTarget(text, 4)?.word).toBe('well-known');
    expect(extractSentenceTarget(text, 21)?.word).toBe("isn't");
  });

  it('returns the containing sentence and relative word offsets', () => {
    const text = 'First sentence. The proposal was ultimately rejected. Last.';
    const target = extractSentenceTarget(text, text.indexOf('ultimately') + 2);
    expect(target).toEqual({
      word: 'ultimately',
      sentence: 'The proposal was ultimately rejected.',
      wordStart: 17,
      wordEnd: 27,
    });
  });

  it('extracts a complete sentence across nested inline elements', async () => {
    const { extractSentenceTargetFromNode } = await import(
      '../../src/content/text-segmentation'
    );
    const paragraph = document.createElement('p');
    paragraph.innerHTML = 'The proposal was <strong>ultimately</strong> rejected.';
    const node = paragraph.querySelector('strong')?.firstChild;
    expect(node).toBeInstanceOf(Text);
    expect(extractSentenceTargetFromNode(node as Text, 2)).toEqual({
      word: 'ultimately',
      sentence: 'The proposal was ultimately rejected.',
      wordStart: 17,
      wordEnd: 27,
    });
  });

  it('normalizes whitespace without changing semantic text', () => {
    expect(normalizeSentence('  The   proposal\nworked. ')).toBe('The proposal worked.');
  });

  it('ignores editable and code content', () => {
    for (const tag of ['input', 'textarea', 'select', 'pre', 'code']) {
      expect(isIgnoredElement(document.createElement(tag))).toBe(true);
    }
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(isIgnoredElement(editable)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
pnpm vitest run tests/unit/text-segmentation.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic English token and sentence extraction**

Create `src/content/text-segmentation.ts`:

```ts
export interface SentenceTarget {
  word: string;
  sentence: string;
  wordStart: number;
  wordEnd: number;
}

const WORD_PATTERN = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;
const IGNORED_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'PRE', 'CODE', 'SCRIPT', 'STYLE']);

export function normalizeSentence(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function isIgnoredElement(element: Element): boolean {
  return IGNORED_TAGS.has(element.tagName)
    || element instanceof HTMLElement && element.isContentEditable
    || element.closest('[contenteditable="true"]') !== null;
}

function sentenceBounds(text: string, offset: number): [number, number] {
  const segments = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)];
  const segment = segments.find((candidate) =>
    offset >= candidate.index && offset < candidate.index + candidate.segment.length,
  );
  return segment
    ? [segment.index, segment.index + segment.segment.length]
    : [0, text.length];
}

export function extractSentenceTarget(text: string, offset: number): SentenceTarget | null {
  if (offset < 0 || offset >= text.length) return null;
  const matches = [...text.matchAll(WORD_PATTERN)];
  const match = matches.find((candidate) => {
    const start = candidate.index ?? -1;
    return offset >= start && offset < start + candidate[0].length;
  });
  if (!match || match.index === undefined || match[0].length === 1) return null;

  const [rawSentenceStart, rawSentenceEnd] = sentenceBounds(text, match.index);
  const rawSentence = text.slice(rawSentenceStart, rawSentenceEnd);
  const leadingWhitespace = rawSentence.length - rawSentence.trimStart().length;
  const sentence = normalizeSentence(rawSentence);
  const rawPrefix = text.slice(rawSentenceStart + leadingWhitespace, match.index);
  const wordStart = normalizeSentence(rawPrefix).length + (rawPrefix.trim().length > 0 ? 1 : 0);

  return {
    word: match[0],
    sentence,
    wordStart,
    wordEnd: wordStart + match[0].length,
  };
}

export function extractSentenceTargetFromNode(
  node: Text,
  nodeOffset: number,
): SentenceTarget | null {
  const block = node.parentElement?.closest(
    'p,li,blockquote,figcaption,h1,h2,h3,h4,h5,h6,td,th',
  ) ?? node.parentElement;
  if (!block) return extractSentenceTarget(node.data, nodeOffset);

  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(candidate) {
      const parent = candidate.parentElement;
      return parent && !isIgnoredElement(parent) && candidate.textContent?.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  let combined = '';
  let combinedOffset = -1;
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (current === node) combinedOffset = combined.length + nodeOffset;
    combined += `${current.textContent ?? ''} `;
  }
  return combinedOffset < 0
    ? null
    : extractSentenceTarget(combined.trimEnd(), combinedOffset);
}
```

- [ ] **Step 4: Implement point-to-text-node lookup with a Chrome fallback**

Create `src/content/target-at-point.ts`:

```ts
import {
  extractSentenceTargetFromNode,
  isIgnoredElement,
  type SentenceTarget,
} from './text-segmentation';

interface ChromeDocument extends Document {
  caretRangeFromPoint?(x: number, y: number): Range | null;
}

export function targetAtPoint(x: number, y: number): SentenceTarget | null {
  const element = document.elementFromPoint(x, y);
  if (!element || isIgnoredElement(element)) return null;

  const position = document.caretPositionFromPoint?.(x, y);
  const range = position ? null : (document as ChromeDocument).caretRangeFromPoint?.(x, y);
  const node = position?.offsetNode ?? range?.startContainer;
  const offset = position?.offset ?? range?.startOffset;

  if (!(node instanceof Text) || offset === undefined || !node.textContent) return null;
  if (node.parentElement && isIgnoredElement(node.parentElement)) return null;
  return extractSentenceTargetFromNode(node, offset);
}
```

- [ ] **Step 5: Run unit tests and typecheck**

Run:

```bash
pnpm vitest run tests/unit/text-segmentation.test.ts
pnpm typecheck
```

Expected: tests pass and TypeScript reports no errors. If offset normalization exposes a failing punctuation case, adjust only `wordStart` calculation and add that exact case to the test before proceeding.

- [ ] **Step 6: Commit segmentation**

```bash
git add src/content tests/unit/text-segmentation.test.ts
git commit -m "feat: extract hovered words and source sentences"
```

## Task 4: Build the hover state machine and isolated tooltip

**Files:**
- Create: `src/content/hover-controller.ts`
- Create: `src/content/tooltip.ts`
- Create: `src/content/index.ts`
- Modify: `entrypoints/hover.ts`
- Test: `tests/unit/hover-controller.test.ts`

- [ ] **Step 1: Write failing timing and cancellation tests**

Create `tests/unit/hover-controller.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoverController } from '../../src/content/hover-controller';

afterEach(() => vi.useRealTimers());

describe('HoverController', () => {
  it('looks up after 500ms and auto-saves after another 1000ms', async () => {
    vi.useFakeTimers();
    const lookup = vi.fn().mockResolvedValue({ lookupStatus: 'found' });
    const save = vi.fn().mockResolvedValue({ id: crypto.randomUUID() });
    const controller = new HoverController({ lookup, save, close: vi.fn() });

    controller.enter({
      word: 'ultimately',
      sentence: 'It was ultimately rejected.',
      wordStart: 7,
      wordEnd: 17,
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(lookup).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(save).toHaveBeenCalledOnce();
  });

  it('cancels lookup and save when pointer leaves', async () => {
    vi.useFakeTimers();
    const lookup = vi.fn();
    const save = vi.fn();
    const controller = new HoverController({ lookup, save, close: vi.fn() });
    controller.enter({
      word: 'cancelled',
      sentence: 'This is cancelled.',
      wordStart: 8,
      wordEnd: 17,
    });
    controller.leave();
    await vi.runAllTimersAsync();
    expect(lookup).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run:

```bash
pnpm vitest run tests/unit/hover-controller.test.ts
```

Expected: FAIL because `HoverController` does not exist.

- [ ] **Step 3: Implement the hover controller**

Create `src/content/hover-controller.ts`:

```ts
import { AUTO_SAVE_DELAY_MS, HOVER_DELAY_MS } from '../shared/constants';
import type { SentenceTarget } from './text-segmentation';

interface HoverDependencies {
  lookup(target: SentenceTarget): Promise<{ lookupStatus: 'found' | 'not_found' }>;
  save(target: SentenceTarget): Promise<unknown>;
  close(): void;
}

export class HoverController {
  private lookupTimer?: number;
  private saveTimer?: number;
  private generation = 0;

  constructor(private readonly deps: HoverDependencies) {}

  enter(target: SentenceTarget): void {
    this.cancelTimers();
    const generation = ++this.generation;
    this.lookupTimer = window.setTimeout(async () => {
      const result = await this.deps.lookup(target);
      if (generation !== this.generation || result.lookupStatus !== 'found') return;
      this.saveTimer = window.setTimeout(() => {
        if (generation === this.generation) void this.deps.save(target);
      }, AUTO_SAVE_DELAY_MS);
    }, HOVER_DELAY_MS);
  }

  leave(): void {
    this.generation += 1;
    this.cancelTimers();
    this.deps.close();
  }

  destroy(): void {
    this.leave();
  }

  private cancelTimers(): void {
    if (this.lookupTimer !== undefined) window.clearTimeout(this.lookupTimer);
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    this.lookupTimer = undefined;
    this.saveTimer = undefined;
  }
}
```

- [ ] **Step 4: Implement a safe Shadow DOM tooltip**

Create `src/content/tooltip.ts`:

```ts
import type { DictionaryEntry } from '../shared/models';
import { UNDO_WINDOW_MS } from '../shared/constants';

export interface TooltipHandle {
  show(entry: DictionaryEntry, rect: DOMRect): void;
  showSaved(onUndo: () => void): void;
  showError(message: string): void;
  hide(): void;
  destroy(): void;
}

export function createTooltip(): TooltipHandle {
  const host = document.createElement('div');
  host.dataset.contextVocabularyUi = 'true';
  host.dataset.state = 'hidden';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .card { position: fixed; z-index: 2147483647; width: 280px; padding: 12px;
      border: 1px solid #d7d2c8; border-radius: 10px; background: #fffdf8;
      color: #201f1c; box-shadow: 0 8px 24px rgb(0 0 0 / 16%);
      font: 14px/1.45 system-ui, sans-serif; }
    h2 { margin: 0 0 6px; font-size: 18px; }
    ol { margin: 6px 0; padding-left: 20px; }
    button { font: inherit; }
    [hidden] { display: none; }
  `;
  const card = document.createElement('section');
  card.className = 'card';
  card.hidden = true;
  shadow.append(style, card);
  document.documentElement.append(host);

  const position = (rect: DOMRect) => {
    const top = rect.bottom + 8 + 220 < innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - 180);
    const left = Math.min(Math.max(8, rect.left), innerWidth - 296);
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  };

  return {
    show(entry, rect) {
      card.replaceChildren();
      const title = document.createElement('h2');
      title.textContent = entry.lemma;
      const phonetic = document.createElement('div');
      phonetic.textContent = entry.phonetic ? `/${entry.phonetic}/` : '';
      const definitions = document.createElement('ol');
      for (const text of entry.definitionsZh.slice(0, 3)) {
        const item = document.createElement('li');
        item.textContent = text;
        definitions.append(item);
      }
      card.append(title, phonetic, definitions);
      position(rect);
      card.hidden = false;
      host.dataset.state = 'visible';
    },
    showSaved(onUndo) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '已保存 · 撤销';
      button.addEventListener('click', onUndo, { once: true });
      card.append(button);
      window.setTimeout(() => button.remove(), UNDO_WINDOW_MS);
    },
    showError(message) {
      card.replaceChildren(document.createTextNode(message));
      card.hidden = false;
      host.dataset.state = 'visible';
    },
    hide() {
      card.hidden = true;
      host.dataset.state = 'hidden';
    },
    destroy() {
      host.remove();
    },
  };
}
```

- [ ] **Step 5: Compose the content runtime and entrypoint**

Create `src/content/index.ts`:

```ts
import { HoverController } from './hover-controller';
import { targetAtPoint } from './target-at-point';
import { createTooltip } from './tooltip';

export function startContentRuntime(): () => void {
  const tooltip = createTooltip();
  let lastKey = '';
  let lastRect = new DOMRect();

  const controller = new HoverController({
    async lookup(target) {
      const response = await browser.runtime.sendMessage({
        type: 'LOOKUP_WORD',
        word: target.word,
      });
      if (!response.ok) {
        tooltip.showError(response.error);
        return { lookupStatus: 'not_found' as const };
      }
      if (response.data.lookupStatus === 'found') {
        tooltip.show(response.data.entry, lastRect);
      } else {
        tooltip.showError('离线词典未收录');
      }
      return { lookupStatus: response.data.lookupStatus };
    },
    async save(target) {
      const response = await browser.runtime.sendMessage({
        type: 'SAVE_CAPTURE',
        payload: {
          ...target,
          surfaceWord: target.word,
          sourceTitle: document.title,
          sourceUrl: location.href,
        },
      });
      if (!response.ok) throw new Error(response.error);
      tooltip.showSaved(() => {
        void browser.runtime.sendMessage({
          type: 'UNDO_CAPTURE',
          captureId: response.data.capture.id,
          savedAt: response.data.savedAt,
        });
      });
      return response.data;
    },
    close: tooltip.hide,
  });

  const onPointerMove = (event: PointerEvent) => {
    if (event.composedPath().some(
      (node) => node instanceof Element && node.matches('[data-context-vocabulary-ui]'),
    )) return;
    const target = targetAtPoint(event.clientX, event.clientY);
    const key = target ? `${target.word}:${target.sentence}:${target.wordStart}` : '';
    if (key === lastKey) return;
    lastKey = key;
    if (!target) {
      controller.leave();
      return;
    }
    lastRect = new DOMRect(event.clientX, event.clientY, 1, 1);
    controller.enter(target);
  };
  const cancel = () => controller.leave();

  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('scroll', cancel, { passive: true, capture: true });
  window.addEventListener('blur', cancel);

  return () => {
    controller.destroy();
    tooltip.destroy();
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('scroll', cancel, true);
    window.removeEventListener('blur', cancel);
  };
}
```

Replace `entrypoints/hover.ts` with:

```ts
import { startContentRuntime } from '../src/content';

export default defineUnlistedScript(() => {
  const stop = startContentRuntime();
  window.addEventListener('pagehide', stop, { once: true });
});
```

- [ ] **Step 6: Run tests, typecheck, and build**

Run:

```bash
pnpm vitest run tests/unit/hover-controller.test.ts
pnpm typecheck
pnpm build
```

Expected: all commands exit 0 and `.output/chrome-mv3/hover.js` exists.

- [ ] **Step 7: Commit the hover proof**

```bash
git add entrypoints/hover.ts src/content tests/unit/hover-controller.test.ts
git commit -m "feat: add delayed hover lookup tooltip"
```

## Task 5: Build and license the offline ECDICT mini shards

**Files:**
- Create: `scripts/build-dictionary.mjs`
- Create: `public/dictionary/index.json`
- Create: `public/dictionary/*.json`
- Create: `public/dictionary/LICENSE`
- Create: `THIRD_PARTY_NOTICES.md`
- Test: `tests/unit/normalize.test.ts`

- [ ] **Step 1: Add the ECDICT source with explicit execution approval**

At execution time, request permission before downloading this public MIT-licensed build input:

```bash
mkdir -p data/source public/dictionary
curl -L https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.mini.csv -o data/source/ecdict.csv
curl -L https://raw.githubusercontent.com/skywind3000/ECDICT/master/LICENSE -o public/dictionary/LICENSE
```

Expected: both files are non-empty. `data/source/ecdict.csv` remains ignored; the generated shards and license are committed.

- [ ] **Step 2: Write the shard build script**

Create `scripts/build-dictionary.mjs`:

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

const sourcePath = new URL('../data/source/ecdict.csv', import.meta.url);
const outputDir = new URL('../public/dictionary/', import.meta.url);
const csv = await readFile(sourcePath, 'utf8');
const rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true });
const shards = new Map();

for (const row of rows) {
  const word = String(row.word ?? '').trim().toLowerCase();
  const definitionsZh = String(row.translation ?? '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 6);
  if (!/^[a-z][a-z' -]*$/.test(word) || definitionsZh.length === 0) continue;

  const shard = /^[a-z]/.test(word[0]) ? word[0] : '_';
  const partOfSpeech = [...String(row.pos ?? '').matchAll(/([a-z]+):/gi)]
    .map((match) => match[1].toLowerCase());
  const entry = {
    lemma: word,
    phonetic: String(row.phonetic ?? '').trim() || undefined,
    partOfSpeech: [...new Set(partOfSpeech)],
    definitionsZh,
    frequencyRank: Number(row.frq) || undefined,
  };
  const bucket = shards.get(shard) ?? {};
  bucket[word] = entry;
  shards.set(shard, bucket);
}

await mkdir(outputDir, { recursive: true });
const index = {};
for (const [shard, entries] of [...shards.entries()].sort()) {
  const filename = `${shard}.json`;
  await writeFile(new URL(filename, outputDir), JSON.stringify(entries));
  index[shard] = filename;
}
await writeFile(new URL('index.json', outputDir), JSON.stringify(index, null, 2));
console.log(`Built ${Object.keys(index).length} dictionary shards`);
```

- [ ] **Step 3: Generate shards and validate representative entries**

Run:

```bash
pnpm dict:build
node -e "const fs=require('fs'); const a=JSON.parse(fs.readFileSync('public/dictionary/a.json','utf8')); if (!a.ability) process.exit(1); console.log(a.ability.lemma)"
```

Expected: the build reports at least 20 shards and the validation prints `ability`.

- [ ] **Step 4: Record third-party attribution**

Create `THIRD_PARTY_NOTICES.md`:

```md
# Third-party notices

## ECDICT

This product includes data derived from ECDICT:
https://github.com/skywind3000/ECDICT

ECDICT is distributed under the MIT License. A copy of that license is
included at `public/dictionary/LICENSE`.

The runtime dictionary shards are generated from `ecdict.mini.csv`; the
application does not contact ECDICT or any dictionary server at runtime.
```

- [ ] **Step 5: Verify build output and commit**

Run:

```bash
pnpm build
test -s .output/chrome-mv3/dictionary/index.json
```

Expected: build exits 0 and the generated dictionary index exists in the extension output.

```bash
git add scripts public/dictionary THIRD_PARTY_NOTICES.md package.json pnpm-lock.yaml
git commit -m "feat: bundle licensed offline dictionary shards"
```

## Task 6: Implement dictionary normalization and lookup

**Files:**
- Create: `src/dictionary/types.ts`
- Create: `src/dictionary/normalize.ts`
- Create: `src/dictionary/engine.ts`
- Test: `tests/unit/normalize.test.ts`

- [ ] **Step 1: Write failing normalization tests**

Create `tests/unit/normalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { candidateLemmas, normalizeWord } from '../../src/dictionary/normalize';

describe('dictionary normalization', () => {
  it('normalizes curly apostrophes and case', () => {
    expect(normalizeWord('ISN’T')).toBe("isn't");
  });

  it('offers controlled inflection candidates without guessing unrelated words', () => {
    expect(candidateLemmas('studies')).toEqual(['studies', 'study', 'studi']);
    expect(candidateLemmas('running')).toContain('run');
    expect(candidateLemmas('rejected')).toContain('reject');
  });
});
```

- [ ] **Step 2: Run and observe the missing-module failure**

Run:

```bash
pnpm vitest run tests/unit/normalize.test.ts
```

Expected: FAIL because the normalization module does not exist.

- [ ] **Step 3: Implement controlled candidates**

Create `src/dictionary/types.ts`:

```ts
import type { DictionaryEntry } from '../shared/models';

export type DictionaryShard = Record<string, DictionaryEntry>;

export type LookupResult =
  | { lookupStatus: 'found'; entry: DictionaryEntry }
  | { lookupStatus: 'not_found' };
```

Create `src/dictionary/normalize.ts`:

```ts
export function normalizeWord(word: string): string {
  return word.trim().toLocaleLowerCase('en').replaceAll('’', "'");
}

export function candidateLemmas(word: string): string[] {
  const normalized = normalizeWord(word);
  const values = [normalized];
  if (normalized.endsWith('ies') && normalized.length > 4) {
    values.push(`${normalized.slice(0, -3)}y`);
  }
  if (normalized.endsWith('es') && normalized.length > 3) {
    values.push(normalized.slice(0, -2));
  }
  if (normalized.endsWith('s') && normalized.length > 3) {
    values.push(normalized.slice(0, -1));
  }
  if (normalized.endsWith('ied') && normalized.length > 4) {
    values.push(`${normalized.slice(0, -3)}y`);
  }
  if (normalized.endsWith('ed') && normalized.length > 4) {
    values.push(normalized.slice(0, -2), normalized.slice(0, -1));
  }
  if (normalized.endsWith('ing') && normalized.length > 5) {
    const stem = normalized.slice(0, -3);
    values.push(stem, `${stem}e`);
    if (stem.at(-1) === stem.at(-2)) values.push(stem.slice(0, -1));
  }
  return [...new Set(values)];
}
```

- [ ] **Step 4: Implement lazy shard loading**

Create `src/dictionary/engine.ts`:

```ts
import { candidateLemmas } from './normalize';
import type { DictionaryShard, LookupResult } from './types';

export class DictionaryEngine {
  private readonly cache = new Map<string, Promise<DictionaryShard>>();

  constructor(
    private readonly loadShard: (key: string) => Promise<DictionaryShard> = async (key) => {
      const url = browser.runtime.getURL(`/dictionary/${key}.json`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`DICTIONARY_SHARD_${response.status}`);
      return response.json() as Promise<DictionaryShard>;
    },
  ) {}

  async lookup(surfaceWord: string): Promise<LookupResult> {
    for (const candidate of candidateLemmas(surfaceWord)) {
      const key = /^[a-z]/.test(candidate) ? candidate[0] : '_';
      const shard = await this.getShard(key);
      const entry = shard[candidate];
      if (entry) return { lookupStatus: 'found', entry };
    }
    return { lookupStatus: 'not_found' };
  }

  private getShard(key: string): Promise<DictionaryShard> {
    const existing = this.cache.get(key);
    if (existing) return existing;
    const loading = this.loadShard(key);
    this.cache.set(key, loading);
    return loading;
  }
}
```

- [ ] **Step 5: Fix the expected candidate list and run verification**

The `studies` test intentionally exposes over-broad `-s` fallback. Change its expectation to verify ordered useful candidates without requiring the invalid fallback:

```ts
expect(candidateLemmas('studies').slice(0, 2)).toEqual(['studies', 'study']);
```

Run:

```bash
pnpm vitest run tests/unit/normalize.test.ts
pnpm typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit dictionary lookup**

```bash
git add src/dictionary tests/unit/normalize.test.ts
git commit -m "feat: add lazy offline dictionary lookup"
```

## Task 7: Create IndexedDB repositories and capture deduplication

**Files:**
- Create: `src/storage/database.ts`
- Create: `src/storage/capture-repository.ts`
- Create: `src/storage/digest-repository.ts`
- Test: `tests/integration/repositories.test.ts`

- [ ] **Step 1: Write failing repository tests**

Create `tests/integration/repositories.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { clearDatabaseForTest } from '../../src/storage/database';
import {
  listCaptures,
  saveCapture,
  undoCapture,
} from '../../src/storage/capture-repository';

beforeEach(clearDatabaseForTest);

const input = {
  surfaceWord: 'Ultimately',
  sentence: 'The proposal was ultimately rejected.',
  wordStart: 17,
  wordEnd: 27,
  sourceTitle: 'Article',
  sourceUrl: 'https://example.com/article',
};

describe('capture repository', () => {
  it('deduplicates the same lemma, sentence, and source origin', async () => {
    const first = await saveCapture(input, {
      lemma: 'ultimately',
      definitionsZh: ['最终'],
    }, 100);
    const second = await saveCapture(input, {
      lemma: 'ultimately',
      definitionsZh: ['最终'],
    }, 200);
    expect(second.capture.id).toBe(first.capture.id);
    expect(second.capture.encounterCount).toBe(2);
    expect(second.capture.lastSeenAt).toBe(200);
    await undoCapture(second.capture.id, second.savedAt);
    expect((await listCaptures({}))[0].encounterCount).toBe(1);
  });

  it('deletes a capture for undo', async () => {
    const result = await saveCapture(input, {
      lemma: 'ultimately',
      definitionsZh: ['最终'],
    }, 100);
    await undoCapture(result.capture.id, result.savedAt);
    expect(await listCaptures({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run:

```bash
pnpm vitest run tests/integration/repositories.test.ts
```

Expected: FAIL because repository modules do not exist.

- [ ] **Step 3: Define the IndexedDB schema**

Create `src/storage/database.ts`:

```ts
import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Capture, WeeklyDigest } from '../shared/models';

interface ContextVocabularyDb extends DBSchema {
  captures: {
    key: string;
    value: Capture;
    indexes: {
      dedupeKey: string;
      createdAt: number;
      lemma: string;
      mastered: number;
    };
  };
  digests: {
    key: string;
    value: WeeklyDigest;
    indexes: {
      periodKey: [number, number];
      generatedAt: number;
    };
  };
}

let databasePromise: Promise<IDBPDatabase<ContextVocabularyDb>> | undefined;

export function getDatabase(): Promise<IDBPDatabase<ContextVocabularyDb>> {
  databasePromise ??= openDB<ContextVocabularyDb>('context-vocabulary', 1, {
    upgrade(db) {
      const captures = db.createObjectStore('captures', { keyPath: 'id' });
      captures.createIndex('dedupeKey', 'dedupeKey', { unique: true });
      captures.createIndex('createdAt', 'createdAt');
      captures.createIndex('lemma', 'lemma');
      captures.createIndex('mastered', 'masteredKey');

      const digests = db.createObjectStore('digests', { keyPath: 'id' });
      digests.createIndex('periodKey', ['periodStart', 'periodEnd'], { unique: true });
      digests.createIndex('generatedAt', 'generatedAt');
    },
  });
  return databasePromise;
}

export async function clearDatabaseForTest(): Promise<void> {
  if (databasePromise) (await databasePromise).close();
  databasePromise = undefined;
  await deleteDB('context-vocabulary');
}
```

- [ ] **Step 4: Implement capture validation, dedupe, and CRUD**

Create `src/storage/capture-repository.ts`:

```ts
import type {
  Capture,
  CaptureFilter,
  DictionaryEntry,
  SaveCaptureInput,
  SaveCaptureResult,
} from '../shared/models';
import { assertWordOffset } from '../shared/validation';
import { normalizeWord } from '../dictionary/normalize';
import { getDatabase } from './database';

function normalizeSentence(sentence: string): string {
  return sentence.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
}

function dedupeKey(lemma: string, sentence: string, origin: string): string {
  return `${lemma}\u0000${normalizeSentence(sentence)}\u0000${origin}`;
}

export async function saveCapture(
  input: SaveCaptureInput,
  entry: DictionaryEntry,
  now = Date.now(),
): Promise<SaveCaptureResult> {
  assertWordOffset(input.sentence, input.surfaceWord, input.wordStart, input.wordEnd);
  const url = new URL(input.sourceUrl);
  const normalizedWord = normalizeWord(input.surfaceWord);
  const key = dedupeKey(entry.lemma, input.sentence, url.origin);
  const db = await getDatabase();
  const tx = db.transaction('captures', 'readwrite');
  const existing = await tx.store.index('dedupeKey').get(key);
  if (existing) {
    const updated: Capture = {
      ...existing,
      sourceTitle: input.sourceTitle,
      sourceUrl: input.sourceUrl,
      lastSeenAt: now,
      encounterCount: existing.encounterCount + 1,
    };
    await tx.store.put(updated);
    await tx.done;
    return { capture: updated, savedAt: now };
  }

  const capture: Capture = {
    id: crypto.randomUUID(),
    surfaceWord: input.surfaceWord,
    normalizedWord,
    lemma: entry.lemma,
    phonetic: entry.phonetic,
    partOfSpeech: entry.partOfSpeech,
    definitionsZh: entry.definitionsZh,
    sentence: input.sentence,
    wordStart: input.wordStart,
    wordEnd: input.wordEnd,
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl,
    sourceOrigin: url.origin,
    createdAt: now,
    lastSeenAt: now,
    encounterCount: 1,
    mastered: false,
    masteredKey: 0,
    lookupStatus: 'found',
    dedupeKey: key,
  };
  await tx.store.add(capture);
  await tx.done;
  return { capture, savedAt: now };
}

export async function listCaptures(filter: CaptureFilter): Promise<Capture[]> {
  const captures = await (await getDatabase()).getAll('captures');
  return captures
    .filter((capture) => filter.from === undefined || capture.createdAt >= filter.from)
    .filter((capture) => filter.to === undefined || capture.createdAt < filter.to)
    .filter((capture) => filter.lemma === undefined || capture.lemma === filter.lemma)
    .filter((capture) => filter.mastered === undefined || capture.mastered === filter.mastered)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateCapture(id: string, mastered: boolean): Promise<Capture> {
  const db = await getDatabase();
  const capture = await db.get('captures', id);
  if (!capture) throw new Error('CAPTURE_NOT_FOUND');
  const updated: Capture = { ...capture, mastered, masteredKey: mastered ? 1 : 0 };
  await db.put('captures', updated);
  return updated;
}

export async function undoCapture(id: string, savedAt: number): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction('captures', 'readwrite');
  const capture = await tx.store.get(id);
  if (!capture || capture.lastSeenAt !== savedAt) throw new Error('UNDO_STALE');
  if (capture.encounterCount === 1) {
    await tx.store.delete(id);
  } else {
    await tx.store.put({
      ...capture,
      encounterCount: capture.encounterCount - 1,
      lastSeenAt: capture.createdAt,
    });
  }
  await tx.done;
}

export async function deleteCapture(id: string): Promise<void> {
  await (await getDatabase()).delete('captures', id);
}
```

- [ ] **Step 5: Add digest repository uniqueness**

Create `src/storage/digest-repository.ts`:

```ts
import type { WeeklyDigest } from '../shared/models';
import { getDatabase } from './database';

export async function getDigestByPeriod(
  periodStart: number,
  periodEnd: number,
): Promise<WeeklyDigest | undefined> {
  return (await getDatabase()).getFromIndex('digests', 'periodKey', [periodStart, periodEnd]);
}

export async function putDigest(digest: WeeklyDigest): Promise<void> {
  await (await getDatabase()).put('digests', digest);
}

export async function getDigest(id: string): Promise<WeeklyDigest | undefined> {
  return (await getDatabase()).get('digests', id);
}

export async function listDigests(): Promise<WeeklyDigest[]> {
  return (await (await getDatabase()).getAll('digests'))
    .sort((a, b) => b.periodStart - a.periodStart);
}
```

- [ ] **Step 6: Run repository tests and typecheck**

Run:

```bash
pnpm vitest run tests/integration/repositories.test.ts
pnpm typecheck
```

Expected: tests pass and no type errors remain.

- [ ] **Step 7: Commit persistence**

```bash
git add src/storage tests/integration/repositories.test.ts
git commit -m "feat: persist and deduplicate vocabulary captures"
```

## Task 8: Route messages and add TTS

**Files:**
- Create: `src/background/speech-service.ts`
- Create: `src/background/message-handler.ts`
- Modify: `entrypoints/background.ts`
- Test: `tests/integration/message-handler.test.ts`

- [ ] **Step 1: Write a failing router test**

Create `tests/integration/message-handler.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMessageHandler } from '../../src/background/message-handler';

describe('message handler', () => {
  it('rejects malformed requests before dependencies run', async () => {
    const lookup = vi.fn();
    const handler = createMessageHandler({
      lookup,
      speak: vi.fn(),
      saveCapture: vi.fn(),
      deleteCapture: vi.fn(),
      undoCapture: vi.fn(),
    });
    const response = await handler({ type: 'LOOKUP_WORD', word: '' });
    expect(response).toEqual({ ok: false, error: 'INVALID_REQUEST' });
    expect(lookup).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
pnpm vitest run tests/integration/message-handler.test.ts
```

Expected: FAIL because the message handler does not exist.

- [ ] **Step 3: Implement TTS with stop-before-speak behavior**

Create `src/background/speech-service.ts`:

```ts
export async function speakWord(word: string, rate: number): Promise<void> {
  await browser.tts.stop();
  await browser.tts.speak(word, {
    lang: 'en-US',
    rate,
  });
}
```

- [ ] **Step 4: Implement the first complete message router**

Create `src/background/message-handler.ts`:

```ts
import { DictionaryEngine } from '../dictionary/engine';
import type { LookupResult } from '../dictionary/types';
import { extensionRequestSchema, type ExtensionResponse } from '../shared/messages';
import {
  deleteCapture,
  listCaptures,
  saveCapture,
  undoCapture,
  updateCapture,
} from '../storage/capture-repository';
import { getDigest, listDigests } from '../storage/digest-repository';
import { getSettings, saveSettings } from '../storage/settings-repository';
import { speakWord } from './speech-service';

interface RouterDependencies {
  lookup(word: string): Promise<LookupResult>;
  speak(word: string, rate: number): Promise<void>;
  saveCapture: typeof saveCapture;
  deleteCapture: typeof deleteCapture;
  undoCapture: typeof undoCapture;
}

export function createMessageHandler(deps: RouterDependencies) {
  return async (raw: unknown): Promise<ExtensionResponse> => {
    const parsed = extensionRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: 'INVALID_REQUEST' };
    try {
      const request = parsed.data;
      switch (request.type) {
        case 'LOOKUP_WORD': {
          const result = await deps.lookup(request.word);
          return { ok: true, data: result };
        }
        case 'SPEAK_WORD': {
          const settings = await getSettings();
          await deps.speak(request.word, settings.speechRate);
          return { ok: true };
        }
        case 'SAVE_CAPTURE': {
          const result = await deps.lookup(request.payload.surfaceWord);
          if (result.lookupStatus !== 'found') {
            return { ok: false, error: 'WORD_NOT_FOUND' };
          }
          const saved = await deps.saveCapture(request.payload, result.entry);
          return { ok: true, data: saved };
        }
        case 'UNDO_CAPTURE':
          await deps.undoCapture(request.captureId, request.savedAt);
          return { ok: true };
        case 'DELETE_CAPTURE':
          await deps.deleteCapture(request.id);
          return { ok: true };
        case 'LIST_CAPTURES':
          return { ok: true, data: await listCaptures(request.filter) };
        case 'UPDATE_CAPTURE':
          return { ok: true, data: await updateCapture(request.id, request.mastered) };
        case 'LIST_DIGESTS':
          return { ok: true, data: await listDigests() };
        case 'GET_DIGEST':
          return { ok: true, data: await getDigest(request.digestId) };
        case 'GET_SETTINGS':
          return { ok: true, data: await getSettings() };
        case 'SAVE_SETTINGS':
          return { ok: true, data: await saveSettings(request.patch) };
        default:
          return { ok: false, error: 'NOT_IMPLEMENTED' };
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      };
    }
  };
}

const dictionary = new DictionaryEngine();
export const handleMessage = createMessageHandler({
  lookup: (word) => dictionary.lookup(word),
  speak: speakWord,
  saveCapture,
  deleteCapture,
  undoCapture,
});
```

- [ ] **Step 5: Register the listener at service-worker top level**

Replace `entrypoints/background.ts` with:

```ts
import { handleMessage } from '../src/background/message-handler';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message) => handleMessage(message));
});
```

- [ ] **Step 6: Make successful hover lookup trigger configured TTS**

In `src/content/index.ts`, after a found result and before `tooltip.show`, add:

```ts
const settings = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
if (settings.ok && settings.data.autoSpeak) {
  void browser.runtime.sendMessage({ type: 'SPEAK_WORD', word: target.word });
}
```

- [ ] **Step 7: Run router tests, all unit tests, and build**

Run:

```bash
pnpm vitest run tests/integration/message-handler.test.ts
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit routing and speech**

```bash
git add entrypoints src/background src/content/index.ts tests/integration/message-handler.test.ts
git commit -m "feat: route lookups captures and speech"
```

## Task 9: Implement optional host permission and runtime registration

**Files:**
- Create: `src/background/content-registration.ts`
- Modify: `src/background/message-handler.ts`
- Modify: `entrypoints/background.ts`
- Create: `src/sidepanel/api.ts`
- Modify: `entrypoints/sidepanel/main.ts`
- Modify: `entrypoints/sidepanel/style.css`
- Test: `tests/unit/content-registration.test.ts`

- [ ] **Step 1: Add a failing registration decision test**

Create `tests/unit/content-registration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { registrationAction } from '../../src/background/content-registration';

describe('content registration decision', () => {
  it('registers after grant and unregisters after revoke', () => {
    expect(registrationAction(true, false)).toBe('register');
    expect(registrationAction(false, true)).toBe('unregister');
    expect(registrationAction(true, true)).toBe('none');
  });
});
```

Run:

```bash
pnpm vitest run tests/unit/content-registration.test.ts
```

Expected: FAIL because `content-registration` does not exist.

- [ ] **Step 2: Implement idempotent script registration**

Create `src/background/content-registration.ts`:

```ts
import { CONTENT_SCRIPT_ID, OPTIONAL_ORIGINS } from '../shared/constants';

export async function hasHostPermission(): Promise<boolean> {
  return browser.permissions.contains({ origins: OPTIONAL_ORIGINS });
}

export function registrationAction(
  permitted: boolean,
  registered: boolean,
): 'register' | 'unregister' | 'none' {
  if (permitted && !registered) return 'register';
  if (!permitted && registered) return 'unregister';
  return 'none';
}

export async function ensureContentRegistration(): Promise<void> {
  const registrations = await browser.scripting.getRegisteredContentScripts();
  const registered = registrations.some((item) => item.id === CONTENT_SCRIPT_ID);
  const permitted = await hasHostPermission();
  const action = registrationAction(permitted, registered);

  if (action === 'register') {
    await browser.scripting.registerContentScripts([{
      id: CONTENT_SCRIPT_ID,
      js: ['hover.js'],
      matches: OPTIONAL_ORIGINS,
      allFrames: true,
      runAt: 'document_idle',
      persistAcrossSessions: true,
    }]);
  } else if (action === 'unregister') {
    await browser.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  }
}
```

- [ ] **Step 3: Route permission requests and lifecycle checks**

Add the `SYNC_CONTENT_REGISTRATION` branch in `src/background/message-handler.ts`:

```ts
case 'SYNC_CONTENT_REGISTRATION':
  await ensureContentRegistration();
  return { ok: true };
```

Import `ensureContentRegistration` from `content-registration.ts`.

Replace `entrypoints/background.ts` with:

```ts
import {
  ensureContentRegistration,
} from '../src/background/content-registration';
import { handleMessage } from '../src/background/message-handler';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message) => handleMessage(message));
  browser.runtime.onInstalled.addListener(() => {
    void ensureContentRegistration();
    void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  });
  browser.runtime.onStartup.addListener(() => void ensureContentRegistration());
  browser.permissions.onAdded.addListener(() => void ensureContentRegistration());
  browser.permissions.onRemoved.addListener(() => void ensureContentRegistration());
  void ensureContentRegistration();
});
```

- [ ] **Step 4: Add a typed side-panel message client**

Create `src/sidepanel/api.ts`:

```ts
import type { ExtensionRequest, ExtensionResponse } from '../shared/messages';

export async function send<T>(request: ExtensionRequest): Promise<T> {
  const response = await browser.runtime.sendMessage(request) as ExtensionResponse;
  if (!response.ok) throw new Error(response.error);
  return response.data as T;
}
```

- [ ] **Step 5: Add onboarding UI**

Replace `entrypoints/sidepanel/main.ts` with:

```ts
import { send } from '../../src/sidepanel/api';
import { OPTIONAL_ORIGINS } from '../../src/shared/constants';
import type { Settings } from '../../src/shared/models';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root');

async function render(): Promise<void> {
  const settings = await send<Settings>({ type: 'GET_SETTINGS' });
  root.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = '语境生词本';
  const description = document.createElement('p');
  description.textContent = '插件只在本机处理你稳定悬停的单词和句子。';
  root.append(heading, description);

  if (!settings.hostPermissionOnboardingComplete) {
    const button = document.createElement('button');
    button.textContent = '允许在英语网页上取词';
    button.addEventListener('click', async () => {
      const granted = await browser.permissions.request({ origins: OPTIONAL_ORIGINS });
      await send<Settings>({
        type: 'SAVE_SETTINGS',
        patch: { hostPermissionOnboardingComplete: granted },
      });
      await send({ type: 'SYNC_CONTENT_REGISTRATION' });
      description.textContent = granted
        ? '已启用网页取词。'
        : '未获得网页权限，可稍后在设置中启用。';
    });
    root.append(button);
  }
}

void render();
```

- [ ] **Step 6: Build and manually verify permission flow**

Run:

```bash
pnpm vitest run tests/unit/content-registration.test.ts
pnpm typecheck
pnpm build
```

Expected: tests, typecheck, and build exit 0. Load `.output/chrome-mv3` unpacked, open the side panel, click the permission button, then verify:

```js
await chrome.scripting.getRegisteredContentScripts()
```

Expected in the service-worker console: one registration with ID `context-vocabulary-hover`, `allFrames: true`, and the two HTTP(S) match patterns.

- [ ] **Step 7: Commit optional permission support**

```bash
git add entrypoints src/background src/sidepanel tests/unit/content-registration.test.ts
git commit -m "feat: register hover script after user permission"
```

## Task 10: Build the current and vocabulary side-panel views

**Files:**
- Create: `src/sidepanel/app.ts`
- Create: `src/sidepanel/components/capture-card.ts`
- Create: `src/sidepanel/views/current.ts`
- Create: `src/sidepanel/views/vocabulary.ts`
- Modify: `entrypoints/sidepanel/main.ts`
- Modify: `entrypoints/sidepanel/style.css`
- Test: `tests/unit/text-segmentation.test.ts`

- [ ] **Step 1: Add a safe highlighting regression test**

Append to `tests/unit/text-segmentation.test.ts`:

```ts
it('does not treat HTML-like sentence text as markup', async () => {
  const { createHighlightedSentence } = await import(
    '../../src/sidepanel/components/capture-card'
  );
  const node = createHighlightedSentence('Use <script> safely', 4, 12);
  expect(node.querySelector('script')).toBeNull();
  expect(node.textContent).toBe('Use <script> safely');
  expect(node.querySelector('mark')?.textContent).toBe('<script>');
});
```

- [ ] **Step 2: Run the test and verify missing module**

Run:

```bash
pnpm vitest run tests/unit/text-segmentation.test.ts
```

Expected: FAIL because `capture-card` does not exist.

- [ ] **Step 3: Implement safe sentence rendering and capture cards**

Create `src/sidepanel/components/capture-card.ts`:

```ts
import type { Capture } from '../../shared/models';
import { send } from '../api';

export function createHighlightedSentence(
  sentence: string,
  start: number,
  end: number,
): HTMLElement {
  const paragraph = document.createElement('p');
  paragraph.append(document.createTextNode(sentence.slice(0, start)));
  const mark = document.createElement('mark');
  mark.textContent = sentence.slice(start, end);
  paragraph.append(mark, document.createTextNode(sentence.slice(end)));
  return paragraph;
}

export function createCaptureCard(capture: Capture, refresh: () => void): HTMLElement {
  const article = document.createElement('article');
  article.className = 'capture-card';
  const heading = document.createElement('h2');
  heading.textContent = capture.phonetic
    ? `${capture.lemma} /${capture.phonetic}/`
    : capture.lemma;
  const definitions = document.createElement('p');
  definitions.textContent = capture.definitionsZh.slice(0, 3).join('；');
  const sentence = createHighlightedSentence(
    capture.sentence,
    capture.wordStart,
    capture.wordEnd,
  );
  const controls = document.createElement('div');
  controls.className = 'card-actions';

  const speak = document.createElement('button');
  speak.textContent = '发音';
  speak.addEventListener('click', () => void send({
    type: 'SPEAK_WORD',
    word: capture.surfaceWord,
  }));
  const mastered = document.createElement('button');
  mastered.textContent = capture.mastered ? '取消已掌握' : '已掌握';
  mastered.addEventListener('click', async () => {
    await send({
      type: 'UPDATE_CAPTURE',
      id: capture.id,
      mastered: !capture.mastered,
    });
    refresh();
  });
  const remove = document.createElement('button');
  remove.textContent = '删除';
  remove.addEventListener('click', async () => {
    await send({ type: 'DELETE_CAPTURE', id: capture.id });
    refresh();
  });
  controls.append(speak, mastered, remove);
  article.append(heading, definitions, sentence, controls);
  return article;
}
```

- [ ] **Step 4: Implement current and grouped vocabulary views**

Create `src/sidepanel/views/current.ts`:

```ts
import type { Capture, WeeklyDigest } from '../../shared/models';
import { send } from '../api';
import { createCaptureCard } from '../components/capture-card';

export async function renderCurrent(container: HTMLElement, refresh: () => void): Promise<void> {
  const digests = await send<WeeklyDigest[]>({ type: 'LIST_DIGESTS' });
  const latestPeriodEnd = digests[0]?.periodEnd;
  const captures = await send<Capture[]>({
    type: 'LIST_CAPTURES',
    filter: latestPeriodEnd ? { from: latestPeriodEnd } : {},
  });
  container.replaceChildren();
  for (const capture of captures) container.append(createCaptureCard(capture, refresh));
  if (captures.length === 0) container.textContent = '还没有收藏的语境句子。';
}
```

Create `src/sidepanel/views/vocabulary.ts`:

```ts
import type { Capture } from '../../shared/models';
import { send } from '../api';

export async function renderVocabulary(container: HTMLElement): Promise<void> {
  const captures = await send<Capture[]>({ type: 'LIST_CAPTURES', filter: {} });
  const groups = new Map<string, Capture[]>();
  for (const capture of captures) {
    groups.set(capture.lemma, [...(groups.get(capture.lemma) ?? []), capture]);
  }
  container.replaceChildren();
  for (const [lemma, items] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const section = document.createElement('section');
    const heading = document.createElement('h2');
    heading.textContent = `${lemma} · 遇见 ${items.reduce((sum, item) => sum + item.encounterCount, 0)} 次`;
    const list = document.createElement('ul');
    for (const item of items) {
      const row = document.createElement('li');
      row.textContent = item.sentence;
      list.append(row);
    }
    section.append(heading, list);
    container.append(section);
  }
  if (groups.size === 0) container.textContent = '生词库为空。';
}
```

- [ ] **Step 5: Add panel navigation**

Create `src/sidepanel/app.ts`:

```ts
import { OPTIONAL_ORIGINS } from '../shared/constants';
import type { Settings } from '../shared/models';
import { send } from './api';
import { renderCurrent } from './views/current';
import { renderVocabulary } from './views/vocabulary';

type Route = 'current' | 'vocabulary';

export async function startSidePanel(root: HTMLElement): Promise<void> {
  const settings = await send<Settings>({ type: 'GET_SETTINGS' });
  if (!settings.hostPermissionOnboardingComplete) {
    const heading = document.createElement('h1');
    heading.textContent = '语境生词本';
    const description = document.createElement('p');
    description.textContent = '只在本机处理你稳定悬停的单词和句子。';
    const button = document.createElement('button');
    button.textContent = '允许在英语网页上取词';
    button.addEventListener('click', async () => {
      const granted = await browser.permissions.request({ origins: OPTIONAL_ORIGINS });
      await send({
        type: 'SAVE_SETTINGS',
        patch: { hostPermissionOnboardingComplete: granted },
      });
      await send({ type: 'SYNC_CONTENT_REGISTRATION' });
      if (granted) await startSidePanel(root);
      else description.textContent = '没有获得网页权限，插件尚未启用取词。';
    });
    root.replaceChildren(heading, description, button);
    return;
  }

  let route: Route = 'current';
  const nav = document.createElement('nav');
  const content = document.createElement('main');

  const render = async () => {
    for (const button of nav.querySelectorAll('button')) {
      button.toggleAttribute('aria-current', button.dataset.route === route);
    }
    if (route === 'current') await renderCurrent(content, () => void render());
    if (route === 'vocabulary') await renderVocabulary(content);
  };

  for (const [value, label] of [
    ['current', '本期'],
    ['vocabulary', '生词库'],
  ] as const) {
    const button = document.createElement('button');
    button.dataset.route = value;
    button.textContent = label;
    button.addEventListener('click', () => {
      route = value;
      void render();
    });
    nav.append(button);
  }
  root.replaceChildren(nav, content);
  void render();
}
```

Replace `entrypoints/sidepanel/main.ts` startup with:

```ts
import { startSidePanel } from '../../src/sidepanel/app';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root');
void startSidePanel(root);
```

- [ ] **Step 6: Add usable panel styles**

Append to `entrypoints/sidepanel/style.css`:

```css
nav {
  display: flex;
  gap: 8px;
  position: sticky;
  top: 0;
  padding: 12px;
  background: Canvas;
  border-bottom: 1px solid color-mix(in srgb, CanvasText 15%, transparent);
}

nav button[aria-current] {
  font-weight: 700;
  text-decoration: underline;
}

.capture-card {
  margin: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, CanvasText 16%, transparent);
  border-radius: 10px;
}

.capture-card h2 {
  margin: 0;
  font-size: 18px;
}

.card-actions {
  display: flex;
  gap: 8px;
}

mark {
  background: #ffe08a;
  color: #201f1c;
}
```

- [ ] **Step 7: Run tests, build, and manually inspect**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands exit 0. In the unpacked extension, saved records render with safe highlighted text and all three actions work.

- [ ] **Step 8: Commit side-panel capture views**

```bash
git add entrypoints/sidepanel src/sidepanel tests/unit/text-segmentation.test.ts
git commit -m "feat: add side panel vocabulary views"
```

## Task 11: Add settings, global pause, source privacy, and site exclusions

**Files:**
- Create: `src/sidepanel/views/settings.ts`
- Modify: `src/sidepanel/app.ts`
- Modify: `src/content/index.ts`
- Modify: `src/storage/capture-repository.ts`
- Modify: `src/background/message-handler.ts`
- Test: `tests/unit/settings.test.ts`

- [ ] **Step 1: Add a failing site-enabled helper test**

Append to `tests/unit/settings.test.ts`:

```ts
import { isOriginEnabled } from '../../src/storage/settings-repository';

it('disables globally paused and explicitly excluded origins', () => {
  expect(isOriginEnabled(DEFAULT_SETTINGS, 'https://example.com')).toBe(true);
  expect(isOriginEnabled({ ...DEFAULT_SETTINGS, enabled: false }, 'https://example.com')).toBe(false);
  expect(isOriginEnabled({
    ...DEFAULT_SETTINGS,
    disabledOrigins: ['https://example.com'],
  }, 'https://example.com')).toBe(false);
});
```

- [ ] **Step 2: Implement the helper and run the focused test**

Add to `src/storage/settings-repository.ts`:

```ts
export function isOriginEnabled(settings: Settings, origin: string): boolean {
  return settings.enabled && !settings.disabledOrigins.includes(origin);
}
```

Run:

```bash
pnpm vitest run tests/unit/settings.test.ts
```

Expected: PASS.

- [ ] **Step 3: Enforce pause and site exclusions in the content runtime**

At content runtime startup in `src/content/index.ts`, load settings and return without listeners when disabled:

```ts
const settingsResponse = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
if (
  !settingsResponse.ok
  || !settingsResponse.data.enabled
  || settingsResponse.data.disabledOrigins.includes(location.origin)
) return () => undefined;
```

Change `startContentRuntime` to `async function` returning `Promise<() => void>`, and update `entrypoints/hover.ts`:

```ts
export default defineUnlistedScript(async () => {
  const stop = await startContentRuntime();
  window.addEventListener('pagehide', stop, { once: true });
});
```

- [ ] **Step 4: Respect the source-storage switch**

Before calling `saveCapture` in the `SAVE_CAPTURE` branch, read settings and sanitize the input:

```ts
const settings = await getSettings();
const payload = settings.saveSource
  ? request.payload
  : {
      ...request.payload,
      sourceTitle: '',
      sourceUrl: new URL('/', request.payload.sourceUrl).toString(),
    };
const saved = await deps.saveCapture(payload, result.entry);
return { ok: true, data: saved };
```

This preserves a valid origin for dedupe while discarding the page path and title.

- [ ] **Step 5: Implement the settings view**

Create `src/sidepanel/views/settings.ts`:

```ts
import { OPTIONAL_ORIGINS } from '../../shared/constants';
import type { Settings } from '../../shared/models';
import { send } from '../api';

export async function renderSettings(container: HTMLElement, refresh: () => void): Promise<void> {
  const settings = await send<Settings>({ type: 'GET_SETTINGS' });
  container.replaceChildren();
  const form = document.createElement('form');

  const checkbox = (labelText: string, key: 'enabled' | 'autoSpeak' | 'saveSource') => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = settings[key];
    input.addEventListener('change', async () => {
      await send({ type: 'SAVE_SETTINGS', patch: { [key]: input.checked } });
      refresh();
    });
    label.append(input, document.createTextNode(labelText));
    return label;
  };

  const rate = document.createElement('input');
  rate.type = 'range';
  rate.min = '0.5';
  rate.max = '2';
  rate.step = '0.1';
  rate.value = String(settings.speechRate);
  rate.addEventListener('change', () => void send({
    type: 'SAVE_SETTINGS',
    patch: { speechRate: Number(rate.value) },
  }));

  const disableSite = document.createElement('button');
  disableSite.type = 'button';
  disableSite.textContent = '输入要停用的站点';
  disableSite.addEventListener('click', async () => {
    const origin = prompt('输入完整来源，例如 https://example.com');
    if (!origin) return;
    await send({
      type: 'SAVE_SETTINGS',
      patch: { disabledOrigins: [...settings.disabledOrigins, origin] },
    });
    refresh();
  });

  const permission = document.createElement('button');
  permission.type = 'button';
  permission.textContent = '检查或重新授予网页权限';
  permission.addEventListener('click', async () => {
    const granted = await browser.permissions.request({ origins: OPTIONAL_ORIGINS });
    await send({
      type: 'SAVE_SETTINGS',
      patch: { hostPermissionOnboardingComplete: granted },
    });
    await send({ type: 'SYNC_CONTENT_REGISTRATION' });
    refresh();
  });

  form.append(
    checkbox('启用取词', 'enabled'),
    checkbox('自动发音', 'autoSpeak'),
    checkbox('保存原网页来源', 'saveSource'),
    document.createTextNode('发音速度'),
    rate,
    disableSite,
    permission,
  );
  container.append(form);
}
```

Update `src/sidepanel/app.ts` with the settings import, route, renderer, and button:

```ts
import { renderSettings } from './views/settings';

type Route = 'current' | 'vocabulary' | 'settings';

if (route === 'settings') await renderSettings(content, () => void render());
```

Add this tuple to the navigation tuple array:

```ts
['settings', '设置'],
```

- [ ] **Step 6: Run regression checks**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands exit 0. Manual check: pausing globally prevents lookup on reload; excluding an origin prevents lookup there; disabling source storage saves only origin-level URL.

- [ ] **Step 7: Commit settings and exclusions**

```bash
git add src entrypoints tests/unit/settings.test.ts
git commit -m "feat: add privacy and reading controls"
```

## Task 12: Generate idempotent weekly digests and notifications

**Files:**
- Create: `src/background/digest-service.ts`
- Create: `src/background/alarm-service.ts`
- Create: `src/background/notification-service.ts`
- Create: `src/background/panel-navigation.ts`
- Create: `src/sidepanel/views/digests.ts`
- Modify: `src/background/message-handler.ts`
- Modify: `src/sidepanel/app.ts`
- Modify: `entrypoints/background.ts`
- Test: `tests/unit/digest-service.test.ts`

- [ ] **Step 1: Write failing period and idempotency tests**

Create `tests/unit/digest-service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { WeeklyDigest } from '../../src/shared/models';
import { previousNaturalWeek, createDigestService } from '../../src/background/digest-service';

describe('weekly digest', () => {
  it('returns the previous Monday-to-Monday window', () => {
    const now = new Date('2026-06-30T12:00:00+08:00').getTime();
    const period = previousNaturalWeek(now);
    expect(new Date(period.periodStart).getDay()).toBe(1);
    expect(new Date(period.periodEnd).getDay()).toBe(1);
    expect(period.periodEnd - period.periodStart).toBe(7 * 24 * 60 * 60 * 1_000);
  });

  it('returns an existing digest instead of creating a duplicate', async () => {
    const existing: WeeklyDigest = {
      id: crypto.randomUUID(),
      periodStart: 0,
      periodEnd: 1,
      generatedAt: 2,
      captureIds: [],
      wordCount: 0,
      sentenceCount: 0,
    };
    const service = createDigestService({
      findByPeriod: vi.fn().mockResolvedValue(existing),
      listCaptures: vi.fn(),
      putDigest: vi.fn(),
    });
    expect(await service.generate(1_000)).toBe(existing);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
pnpm vitest run tests/unit/digest-service.test.ts
```

Expected: FAIL because the digest service does not exist.

- [ ] **Step 3: Implement calendar-week boundaries and digest generation**

Create `src/background/digest-service.ts`:

```ts
import type { WeeklyDigest } from '../shared/models';
import { listCaptures } from '../storage/capture-repository';
import {
  getDigestByPeriod,
  putDigest,
} from '../storage/digest-repository';

export function previousNaturalWeek(now: number): {
  periodStart: number;
  periodEnd: number;
} {
  const current = new Date(now);
  const day = current.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const currentMonday = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate() - daysSinceMonday,
    0, 0, 0, 0,
  );
  const periodEnd = currentMonday.getTime();
  const periodStartDate = new Date(currentMonday);
  periodStartDate.setDate(periodStartDate.getDate() - 7);
  return { periodStart: periodStartDate.getTime(), periodEnd };
}

interface DigestDependencies {
  findByPeriod: typeof getDigestByPeriod;
  listCaptures: typeof listCaptures;
  putDigest: typeof putDigest;
}

export function createDigestService(deps: DigestDependencies) {
  return {
    async generate(now = Date.now()): Promise<WeeklyDigest> {
      const { periodStart, periodEnd } = previousNaturalWeek(now);
      const existing = await deps.findByPeriod(periodStart, periodEnd);
      if (existing) return existing;
      const captures = await deps.listCaptures({ from: periodStart, to: periodEnd });
      const digest: WeeklyDigest = {
        id: crypto.randomUUID(),
        periodStart,
        periodEnd,
        generatedAt: now,
        captureIds: captures.map((capture) => capture.id),
        wordCount: new Set(captures.map((capture) => capture.lemma)).size,
        sentenceCount: captures.length,
      };
      await deps.putDigest(digest);
      return digest;
    },
  };
}

export const digestService = createDigestService({
  findByPeriod: getDigestByPeriod,
  listCaptures,
  putDigest,
});
```

- [ ] **Step 4: Implement alarm creation and recovery**

Create `src/background/alarm-service.ts`:

```ts
import { WEEKLY_ALARM_NAME } from '../shared/constants';
import { getSettings } from '../storage/settings-repository';

function nextMondayAt(now: Date, hour: number, minute: number): number {
  const candidate = new Date(now);
  const daysUntilMonday = (1 - now.getDay() + 7) % 7;
  candidate.setDate(now.getDate() + daysUntilMonday);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 7);
  }
  return candidate.getTime();
}

export async function ensureWeeklyAlarm(now = new Date()): Promise<void> {
  const settings = await getSettings();
  const existing = await browser.alarms.get(WEEKLY_ALARM_NAME);
  const scheduled = nextMondayAt(now, settings.notificationHour, settings.notificationMinute);
  const drift = existing ? Math.abs(existing.scheduledTime - scheduled) : Number.POSITIVE_INFINITY;
  if (!existing || drift > 60_000) {
    await browser.alarms.clear(WEEKLY_ALARM_NAME);
    await browser.alarms.create(WEEKLY_ALARM_NAME, {
      when: scheduled,
      periodInMinutes: 7 * 24 * 60,
    });
  }
}
```

- [ ] **Step 5: Implement notification and panel routing**

Create `src/background/panel-navigation.ts`:

```ts
import { PENDING_DIGEST_KEY } from '../shared/constants';

export async function openDigestPanel(digestId: string): Promise<void> {
  await browser.storage.session.set({ [PENDING_DIGEST_KEY]: digestId });
  const windows = await browser.windows.getAll({ windowTypes: ['normal'] });
  const active = windows.find((window) => window.focused) ?? windows[0];
  if (!active?.id) throw new Error('NO_BROWSER_WINDOW');
  await browser.sidePanel.open({ windowId: active.id });
}
```

Create `src/background/notification-service.ts`:

```ts
import type { WeeklyDigest } from '../shared/models';
import { putDigest } from '../storage/digest-repository';

export async function notifyDigest(digest: WeeklyDigest): Promise<void> {
  if (digest.sentenceCount === 0 || digest.notificationShownAt) return;
  await browser.notifications.create(`digest:${digest.id}`, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon-128.png'),
    title: '本周语境生词已整理',
    message: `收藏 ${digest.sentenceCount} 个句子，遇到 ${digest.wordCount} 个生词。`,
  });
  await putDigest({ ...digest, notificationShownAt: Date.now() });
}
```

Add a generated 128px icon before this task is verified. Create `public/icon.svg` with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="26" fill="#1f4f46"/>
  <path d="M32 30h42c14 0 22 8 22 20s-8 20-22 20H50v28H32V30zm18 16v8h22c4 0 6-1 6-4s-2-4-6-4H50z" fill="#fff8e8"/>
</svg>
```

Install `sharp` and add `scripts/generate-icons.mjs`:

```bash
pnpm add -D sharp
```

```js
import sharp from 'sharp';

for (const size of [16, 32, 48, 128]) {
  await sharp('public/icon.svg').resize(size, size).png()
    .toFile(`public/icon-${size}.png`);
}
```

Add `"icons:build": "node scripts/generate-icons.mjs"` to package scripts and run `pnpm icons:build`.

- [ ] **Step 6: Wire alarms, startup recovery, and notification clicks**

Update the `SAVE_SETTINGS` router branch so notification-time changes immediately
reschedule the alarm:

```ts
case 'SAVE_SETTINGS': {
  const settings = await saveSettings(request.patch);
  await ensureWeeklyAlarm();
  return { ok: true, data: settings };
}
```

Import `ensureWeeklyAlarm` in the message handler.

In `entrypoints/background.ts`, register top-level listeners:

```ts
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== WEEKLY_ALARM_NAME) return;
  await notifyDigest(await digestService.generate());
});
browser.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith('digest:')) return;
  void openDigestPanel(notificationId.slice('digest:'.length));
});
browser.runtime.onInstalled.addListener(() => void ensureWeeklyAlarm());
browser.runtime.onStartup.addListener(async () => {
  await ensureWeeklyAlarm();
  await notifyDigest(await digestService.generate());
});
void ensureWeeklyAlarm();
```

Import `WEEKLY_ALARM_NAME`, `digestService`, `notifyDigest`, `openDigestPanel`, and `ensureWeeklyAlarm`.

- [ ] **Step 7: Implement digest panel view**

Create `src/sidepanel/views/digests.ts`:

```ts
import { PENDING_DIGEST_KEY } from '../../shared/constants';
import type { Capture, WeeklyDigest } from '../../shared/models';
import { send } from '../api';
import { createCaptureCard } from '../components/capture-card';

export async function renderDigests(container: HTMLElement, refresh: () => void): Promise<void> {
  const stored = await browser.storage.session.get(PENDING_DIGEST_KEY);
  const digests = await send<WeeklyDigest[]>({ type: 'LIST_DIGESTS' });
  const selectedId = stored[PENDING_DIGEST_KEY] as string | undefined ?? digests[0]?.id;
  container.replaceChildren();

  for (const digest of digests) {
    const button = document.createElement('button');
    button.textContent = new Date(digest.periodStart).toLocaleDateString();
    button.addEventListener('click', async () => {
      await browser.storage.session.set({ [PENDING_DIGEST_KEY]: digest.id });
      refresh();
    });
    container.append(button);
  }

  const selected = digests.find((digest) => digest.id === selectedId);
  if (!selected) {
    container.append(document.createTextNode('还没有周报。'));
    return;
  }
  const captures = await send<Capture[]>({
    type: 'LIST_CAPTURES',
    filter: { from: selected.periodStart, to: selected.periodEnd },
  });
  for (const capture of captures) {
    container.append(createCaptureCard(capture, refresh));
  }
}
```

Update `src/sidepanel/app.ts`:

```ts
import { PENDING_DIGEST_KEY } from '../shared/constants';
import { renderDigests } from './views/digests';

type Route = 'current' | 'vocabulary' | 'digests' | 'settings';

const pending = await browser.storage.session.get(PENDING_DIGEST_KEY);
let route: Route = pending[PENDING_DIGEST_KEY] ? 'digests' : 'current';

if (route === 'digests') await renderDigests(content, () => void render());
```

Add this tuple to the navigation tuple array:

```ts
['digests', '周报'],
```

- [ ] **Step 8: Run digest tests and full checks**

Run:

```bash
pnpm vitest run tests/unit/digest-service.test.ts
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands exit 0. Generated manifest includes icons, alarms, notifications, and sidePanel permissions.

- [ ] **Step 9: Commit weekly delivery**

```bash
git add entrypoints public scripts src tests package.json pnpm-lock.yaml
git commit -m "feat: deliver idempotent weekly vocabulary digests"
```

## Task 13: Add export, validated import, and complete local deletion

**Files:**
- Create: `src/storage/portability-service.ts`
- Modify: `src/background/message-handler.ts`
- Modify: `src/sidepanel/views/settings.ts`
- Test: `tests/unit/portability-service.test.ts`

- [ ] **Step 1: Write failing import validation tests**

Create `tests/unit/portability-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateImport } from '../../src/storage/portability-service';

describe('import validation', () => {
  it('rejects incompatible versions before writing', () => {
    expect(() => validateImport({ version: 2 })).toThrow('UNSUPPORTED_EXPORT_VERSION');
  });

  it('rejects oversized capture collections', () => {
    expect(() => validateImport({
      version: 1,
      exportedAt: Date.now(),
      captures: Array.from({ length: 50_001 }, () => ({})),
      digests: [],
      settings: {},
    })).toThrow('IMPORT_TOO_LARGE');
  });
});
```

- [ ] **Step 2: Verify failure**

Run:

```bash
pnpm vitest run tests/unit/portability-service.test.ts
```

Expected: FAIL because the portability service does not exist.

- [ ] **Step 3: Implement export, validation, transactional import, and clear**

Create `src/storage/portability-service.ts`:

```ts
import { z } from 'zod';
import type { ExportPayload } from '../shared/models';
import { getDatabase } from './database';
import { getSettings, saveSettings } from './settings-repository';

const captureSchema = z.object({
  id: z.string().uuid(),
  surfaceWord: z.string().min(1).max(80),
  normalizedWord: z.string().min(1).max(80),
  lemma: z.string().min(1).max(80),
  phonetic: z.string().max(200).optional(),
  partOfSpeech: z.array(z.string().max(30)).optional(),
  definitionsZh: z.array(z.string().max(500)).max(10),
  sentence: z.string().min(1).max(2_000),
  wordStart: z.number().int().nonnegative(),
  wordEnd: z.number().int().positive(),
  sourceTitle: z.string().max(500),
  sourceUrl: z.string().url().max(4_096),
  sourceOrigin: z.string().max(500),
  createdAt: z.number(),
  lastSeenAt: z.number(),
  encounterCount: z.number().int().positive(),
  mastered: z.boolean(),
  masteredKey: z.union([z.literal(0), z.literal(1)]),
  lookupStatus: z.enum(['found', 'not_found']),
  dedupeKey: z.string().max(3_000),
});

const digestSchema = z.object({
  id: z.string().uuid(),
  periodStart: z.number(),
  periodEnd: z.number(),
  generatedAt: z.number(),
  captureIds: z.array(z.string().uuid()).max(50_000),
  wordCount: z.number().int().nonnegative(),
  sentenceCount: z.number().int().nonnegative(),
  notificationShownAt: z.number().optional(),
});

export function validateImport(value: unknown): ExportPayload {
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1) {
    throw new Error('UNSUPPORTED_EXPORT_VERSION');
  }
  if ('captures' in value && Array.isArray(value.captures) && value.captures.length > 50_000) {
    throw new Error('IMPORT_TOO_LARGE');
  }
  return z.object({
    version: z.literal(1),
    exportedAt: z.number(),
    captures: z.array(captureSchema).max(50_000),
    digests: z.array(digestSchema).max(1_000),
    settings: z.record(z.string(), z.unknown()),
  }).parse(value) as ExportPayload;
}

export async function exportData(): Promise<ExportPayload> {
  const db = await getDatabase();
  return {
    version: 1,
    exportedAt: Date.now(),
    captures: await db.getAll('captures'),
    digests: await db.getAll('digests'),
    settings: await getSettings(),
  };
}

export async function importData(raw: unknown): Promise<void> {
  const payload = validateImport(raw);
  const db = await getDatabase();
  const tx = db.transaction(['captures', 'digests'], 'readwrite');
  await tx.objectStore('captures').clear();
  await tx.objectStore('digests').clear();
  for (const capture of payload.captures) await tx.objectStore('captures').put(capture);
  for (const digest of payload.digests) await tx.objectStore('digests').put(digest);
  await tx.done;
  await saveSettings(payload.settings);
}

export async function clearAllData(): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(['captures', 'digests'], 'readwrite');
  await tx.objectStore('captures').clear();
  await tx.objectStore('digests').clear();
  await tx.done;
  await browser.storage.local.clear();
  await browser.storage.session.clear();
}
```

- [ ] **Step 4: Route portability messages**

Add router branches:

```ts
case 'EXPORT_DATA':
  return { ok: true, data: await exportData() };
case 'IMPORT_DATA':
  await importData(request.payload);
  return { ok: true };
case 'CLEAR_ALL_DATA':
  await clearAllData();
  return { ok: true };
```

Import the three functions from `portability-service.ts`.

- [ ] **Step 5: Add settings-view buttons**

In `src/sidepanel/views/settings.ts`, append:

```ts
const exportButton = document.createElement('button');
exportButton.type = 'button';
exportButton.textContent = '导出 JSON';
exportButton.addEventListener('click', async () => {
  const payload = await send({ type: 'EXPORT_DATA' });
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `context-vocabulary-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

const importInput = document.createElement('input');
importInput.type = 'file';
importInput.accept = 'application/json';
importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  await send({ type: 'IMPORT_DATA', payload: JSON.parse(await file.text()) });
  refresh();
});

const clearButton = document.createElement('button');
clearButton.type = 'button';
clearButton.textContent = '删除全部本地数据';
clearButton.addEventListener('click', async () => {
  if (!confirm('删除后无法恢复，确定继续？')) return;
  await send({ type: 'CLEAR_ALL_DATA' });
  refresh();
});
form.append(exportButton, importInput, clearButton);
```

- [ ] **Step 6: Run portability and full regression checks**

Run:

```bash
pnpm vitest run tests/unit/portability-service.test.ts
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands exit 0. Manual round trip: export, delete all, import, and see the original captures restored.

- [ ] **Step 7: Commit portability**

```bash
git add src tests/unit/portability-service.test.ts
git commit -m "feat: add local data portability controls"
```

## Task 14: Add optional sentence translation without affecting core behavior

**Files:**
- Create: `src/sidepanel/translator.ts`
- Modify: `src/sidepanel/components/capture-card.ts`
- Test: `tests/unit/translator.test.ts`

- [ ] **Step 1: Write failing availability tests**

Create `tests/unit/translator.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canTranslate } from '../../src/sidepanel/translator';

describe('sentence translator', () => {
  it('returns false when the browser API is absent', () => {
    expect(canTranslate({})).toBe(false);
  });

  it('returns true when Translator exists', () => {
    expect(canTranslate({ Translator: {} })).toBe(true);
  });
});
```

- [ ] **Step 2: Verify the failure**

Run:

```bash
pnpm vitest run tests/unit/translator.test.ts
```

Expected: FAIL because the translator adapter does not exist.

- [ ] **Step 3: Implement feature detection and on-demand model creation**

Create `src/sidepanel/translator.ts`:

```ts
interface TranslatorInstance {
  translate(text: string): Promise<string>;
}

interface TranslatorConstructor {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?(monitor: EventTarget): void;
  }): Promise<TranslatorInstance>;
}

interface TranslatorScope {
  Translator?: TranslatorConstructor | object;
}

export function canTranslate(scope: TranslatorScope = globalThis): boolean {
  return 'Translator' in scope;
}

export async function translateSentence(sentence: string): Promise<string> {
  const constructor = (globalThis as TranslatorScope).Translator as TranslatorConstructor | undefined;
  if (!constructor) throw new Error('TRANSLATOR_UNAVAILABLE');
  const availability = await constructor.availability({
    sourceLanguage: 'en',
    targetLanguage: 'zh',
  });
  if (availability === 'unavailable') throw new Error('LANGUAGE_PAIR_UNAVAILABLE');
  const translator = await constructor.create({
    sourceLanguage: 'en',
    targetLanguage: 'zh',
  });
  return translator.translate(sentence);
}
```

- [ ] **Step 4: Add a progressive-enhancement button to capture cards**

In `createCaptureCard`, only when `canTranslate()` is true, append:

```ts
const translate = document.createElement('button');
translate.textContent = '翻译整句';
translate.addEventListener('click', async () => {
  translate.disabled = true;
  try {
    const translated = document.createElement('p');
    translated.textContent = await translateSentence(capture.sentence);
    article.append(translated);
  } catch {
    const error = document.createElement('p');
    error.textContent = '当前 Chrome 无法下载或使用离线翻译模型。';
    article.append(error);
  } finally {
    translate.disabled = false;
  }
});
controls.append(translate);
```

Import `canTranslate` and `translateSentence`. This button must not appear when the API is absent.

- [ ] **Step 5: Run tests and verify core fallback**

Run:

```bash
pnpm vitest run tests/unit/translator.test.ts
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands exit 0. With `globalThis.Translator` absent in tests, capture cards still render definitions, sentence, speech, mastery, and delete actions.

- [ ] **Step 6: Commit optional translation**

```bash
git add src/sidepanel tests/unit/translator.test.ts
git commit -m "feat: progressively enhance sentence translation"
```

## Task 15: Add end-to-end verification, privacy policy, and release gate

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures.ts`
- Create: `tests/e2e/hover-capture.spec.ts`
- Create: `tests/e2e/privacy.spec.ts`
- Create: `tests/e2e/weekly-digest.spec.ts`
- Create: `tests/fixtures/article.html`
- Create: `scripts/serve-fixtures.mjs`
- Create: `PRIVACY.md`
- Modify: `docs/superpowers/specs/2026-06-30-contextual-vocabulary-chrome-extension-design.md`

- [ ] **Step 1: Add the deterministic article fixture**

Create `tests/fixtures/article.html`:

```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><title>Fixture Article</title></head>
  <body>
    <article>
      <p id="sentence">The proposal was <span id="target-word">ultimately</span> rejected.</p>
      <p><code>const ultimately = false;</code></p>
      <label>Private input <input value="ultimately private"></label>
    </article>
  </body>
</html>
```

- [ ] **Step 2: Configure Playwright persistent Chromium**

Create `scripts/serve-fixtures.mjs`:

```js
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const root = resolve('tests/fixtures');
createServer((request, response) => {
  const path = request.url === '/' ? '/article.html' : request.url;
  if (path !== '/article.html') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  createReadStream(resolve(root, 'article.html')).pipe(response);
}).listen(4173, '127.0.0.1');
```

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  webServer: {
    command: 'node scripts/serve-fixtures.mjs',
    url: 'http://127.0.0.1:4173/article.html',
    reuseExistingServer: false,
  },
  use: {
    trace: 'retain-on-failure',
  },
  workers: 1,
});
```

Replace `wxt.config.ts` with a mode-aware manifest so only E2E builds receive
localhost host permission without a user gesture:

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: ({ mode }) => ({
    name: '语境生词本',
    description: '悬停查词、保存原句并生成每周本地复习周报。',
    permissions: [
      'storage',
      'alarms',
      'notifications',
      'tts',
      'sidePanel',
      'scripting',
    ],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    host_permissions: mode === 'test' ? ['http://127.0.0.1/*'] : undefined,
    action: {
      default_title: '打开语境生词本',
    },
  }),
});
```

Create `tests/e2e/fixtures.ts`:

```ts
import { chromium, test as base, expect, type BrowserContext } from '@playwright/test';
import path from 'node:path';

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const extensionPath = path.resolve('.output/chrome-mv3');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0]
      ?? await context.waitForEvent('serviceworker');
    await use(worker.url().split('/')[2]);
  },
});

export { expect };
```

- [ ] **Step 3: Test the hover-to-panel journey**

Create `tests/e2e/hover-capture.spec.ts`:

```ts
import { test, expect } from './fixtures';

test('hovering a word saves a highlighted source sentence', async ({
  context,
  extensionId,
}) => {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(async () => {
    await chrome.scripting.registerContentScripts([{
      id: 'e2e-hover',
      js: ['hover.js'],
      matches: ['http://127.0.0.1/*'],
      runAt: 'document_idle',
    }]);
    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      patch: { hostPermissionOnboardingComplete: true, autoSpeak: false },
    });
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/article.html');
  await page.locator('#target-word').hover();
  await page.waitForTimeout(2_500);

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.locator('mark')).toHaveText('ultimately');
});
```

- [ ] **Step 4: Test form/code exclusion and business-network silence**

Create `tests/e2e/privacy.spec.ts`:

```ts
import { test, expect } from './fixtures';

test('does not activate on input or code and sends no external requests', async ({ context }) => {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(async () => {
    await chrome.scripting.registerContentScripts([{
      id: 'e2e-privacy-hover',
      js: ['hover.js'],
      matches: ['http://127.0.0.1/*'],
      runAt: 'document_idle',
    }]);
  });
  const externalRequests: string[] = [];
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/article.html');
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['chrome-extension:'].includes(url.protocol)) externalRequests.push(request.url());
  });
  await page.locator('input').hover();
  await page.waitForTimeout(700);
  await expect(page.locator('[data-context-vocabulary-ui]')).toHaveAttribute('data-state', 'hidden');
  await page.locator('code').hover();
  await page.waitForTimeout(700);
  await expect(page.locator('[data-context-vocabulary-ui]')).toHaveAttribute('data-state', 'hidden');
  expect(externalRequests).toEqual([]);
});
```

- [ ] **Step 5: Test digest idempotency at the service-worker boundary**

Create `tests/e2e/weekly-digest.spec.ts`:

```ts
import { test, expect } from './fixtures';

test('repeated weekly alarms keep one period digest', async ({ context }) => {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const count = await worker.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: 'TEST_FIRE_ALARM' });
    await chrome.runtime.sendMessage({ type: 'TEST_FIRE_ALARM' });
    const response = await chrome.runtime.sendMessage({ type: 'LIST_DIGESTS' });
    return response.data.length;
  });
  expect(count).toBe(1);
});
```

Add the test request to `extensionRequestSchema` and `ExtensionRequest`:

```ts
z.object({ type: z.literal('TEST_FIRE_ALARM') }),
```

```ts
| { type: 'TEST_FIRE_ALARM' }
```

Add the guarded router branch; production builds reject the request and expose no
test behavior:

```ts
case 'TEST_FIRE_ALARM':
  if (import.meta.env.MODE !== 'test') {
    return { ok: false, error: 'INVALID_REQUEST' };
  }
  return { ok: true, data: await digestService.generate() };
```

Import `digestService` in the message handler. Configure the E2E build:

```json
{
  "scripts": {
    "build:e2e": "wxt build --mode test",
    "test:e2e": "pnpm build:e2e && playwright test"
  }
}
```

- [ ] **Step 6: Write the local-only privacy policy**

Create `PRIVACY.md`:

```md
# 语境生词本隐私政策

生效日期：2026-06-30

语境生词本读取用户明确授权网站中的可见文字，仅在用户稳定悬停单词时，
提取该单词及其所在句子，用于提供本地释义、发音、收藏和周报功能。

插件不会读取密码框、表单输入、可编辑区域、Cookie 或网页存储；不会保存
完整网页或网页 HTML。收藏的单词、句子、页面标题、来源地址、设置和周报
仅保存在用户设备中的 Chrome 扩展存储。

插件不包含广告、分析或遥测，不会将收藏内容或浏览活动发送给开发者或
任何第三方服务器。Chrome 可在用户主动使用整句翻译功能时管理其内置
本地翻译模型。

用户可以在侧边栏导出数据、关闭来源地址保存，或删除全部本地数据。卸载
插件也会删除其本地扩展数据。
```

- [ ] **Step 7: Mark the approved design status**

Change the design document header from:

```md
状态：待用户审阅
```

to:

```md
状态：已确认，进入实施
```

- [ ] **Step 8: Run the full release gate**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm zip
```

Expected:

- Unit and integration tests report zero failures.
- TypeScript exits 0.
- WXT builds `.output/chrome-mv3`.
- Playwright reports all E2E cases passed using bundled Chromium.
- WXT creates a Chrome distribution ZIP.

- [ ] **Step 9: Perform the manual compatibility matrix**

Load the release build in current Chrome stable and the previous stable on macOS and Windows. Record results in `docs/manual-test-2026-06-30.md` for:

```text
Light / dark theme
100% / 125% / 150% zoom
News article / blog / documentation page
Nested elements / iframe / dynamically inserted paragraph
English system voice present / absent
Chrome closed across scheduled time, then reopened
Host permission revoked after registration
```

Each row records Chrome version, OS, result, and reproducible failure details. Release is blocked by any data-loss, permission, injection, or silent-save failure.

- [ ] **Step 10: Commit the release gate**

```bash
git add .
git commit -m "test: verify local vocabulary extension end to end"
```

## Spec coverage map

| Approved specification requirement | Implemented by |
|---|---|
| 500ms stable hover, cancellation, ignored elements | Tasks 3–4 |
| Offline Chinese definitions and inflection fallback | Tasks 5–6 |
| Automatic English pronunciation and replay | Tasks 8 and 10 |
| 1s auto-save, dedupe, encounter count, 5s undo | Tasks 4, 7–8 |
| Plain-text sentence storage and safe highlighting | Tasks 7 and 10 |
| Current, vocabulary, digest, and settings views | Tasks 10–12 |
| Global pause, site exclusion, source privacy switch | Task 11 |
| Monday 09:00 digest, recovery, idempotency | Task 12 |
| Notification opens the selected digest | Task 12 |
| Local export, validated import, full deletion | Task 13 |
| Translator API as non-blocking enhancement | Task 14 |
| Optional host permission and dynamic all-frame registration | Task 9 |
| No forms, HTML persistence, telemetry, or runtime API calls | Tasks 3, 5, 11, 15 |
| Dictionary source and redistribution license | Tasks 5 and 15 |
| Unit, integration, E2E, restart, compatibility checks | Tasks 1–15 |

## Execution notes

- Complete tasks in order; later tasks rely on types and repositories created earlier.
- Keep each task in one commit. If a task needs more than one reviewable commit, split only at its red/green test boundary.
- Do not weaken a failing test to make an implementation pass unless the test conflicts with the approved specification; document any such conflict before changing the test.
- Do not add cloud APIs, analytics, telemetry, user accounts, or runtime dictionary downloads.
- At every milestone, load the unpacked extension and verify the user-visible journey before continuing.
