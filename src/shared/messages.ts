import { z } from 'zod';
import type {
  CaptureFilter,
  SaveCaptureInput,
  Settings,
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
  z.object({
    type: z.literal('LOOKUP_WORD'),
    word: z.string().min(1).max(80),
  }),
  z.object({
    type: z.literal('SPEAK_WORD'),
    word: z.string().min(1).max(80),
  }),
  z.object({
    type: z.literal('SAVE_CAPTURE'),
    payload: saveCaptureInputSchema,
  }),
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
  z.object({
    type: z.literal('DELETE_CAPTURE'),
    id: z.string().uuid(),
  }),
  z.object({ type: z.literal('LIST_DIGESTS') }),
  z.object({
    type: z.literal('GET_DIGEST'),
    digestId: z.string().uuid(),
  }),
  z.object({ type: z.literal('GET_SETTINGS') }),
  z.object({
    type: z.literal('SAVE_SETTINGS'),
    patch: settingsPatchSchema,
  }),
  z.object({ type: z.literal('SYNC_CONTENT_REGISTRATION') }),
  z.object({ type: z.literal('EXPORT_DATA') }),
  z.object({
    type: z.literal('IMPORT_DATA'),
    payload: z.unknown(),
  }),
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
