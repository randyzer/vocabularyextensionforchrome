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
