export interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  score: number;
  icon: string | null;
  actions: string[];
  data: Record<string, unknown>;
  matchRanges?: [number, number][];
  pin?: boolean;
  isIntent?: boolean;
}

export interface LearnedIntent {
  query: string;
  title: string;
  subtitle?: string;
  path?: string;
  type: string;
  count?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  status: string;
  indexed: number;
  matches?: number;
  lastIndexUpdate?: number;
  recentIntents?: LearnedIntent[];
}

export interface Appearance {
  theme: 'dark' | 'light' | 'system';
  accentColor: string;
  glassBlur: number;
  animations: boolean;
}

export interface LumosAPI {
  search: (q: string) => Promise<SearchResponse>;
  runAction: (action: string, result: SearchResult) => void;
  hide: () => void;
  getIcon: (path: string, kind: string) => Promise<string | null>;
  previewFile: (path: string) => Promise<string | null>;
  getMeta: (path: string) => Promise<{ mtime: number; size: number } | null>;
  openSettings: () => void;
  getAppearance: () => Promise<Appearance>;
  getRecentIntents: () => Promise<LearnedIntent[]>;
  setExpanded: (expanded: boolean) => void;
  onStatus: (cb: (s: { status: string; indexed: number; scanned?: number; lastIndexUpdate?: number }) => void) => void;
  onShown: (cb: (d?: { appearance?: Appearance }) => void) => void;
  onSetQuery: (cb: (q: string) => void) => void;
  onAiResponse: (cb: (d: { error?: string; answer?: string }) => void) => void;
}

declare global {
  interface Window {
    lumos: LumosAPI;
  }
}

export const ACTION_LABELS: Record<string, string> = {
  open: 'Open',
  reveal: 'Show in Explorer',
  copy: 'Copy',
  paste: 'Paste',
  'open-external': 'Open in browser',
  'open-settings': 'Open Settings',
  'rebuild-index': 'Rebuild Index',
  'scope-clip': 'Browse Clipboard',
  'system-run': 'Run',
  'window-focus': 'Focus',
  'window-snap': 'Snap',
  'kill-process': 'Kill',
  'ai-ask': 'Ask AI',
  'ai-chat': 'AI Chat',
  'run-workflow': 'Run Workflow',
  'pin-favourite': 'Pin',
};

export const ICONS: Record<string, string> = {
  app: '▶', folder: '📁', file: '📄', calc: '🧮', convert: '🔁', websearch: '🌐',
  clip: '📋', snippet: '✂️', emoji: '😀', quicklink: '🔗', system: '⚙️', command: '⚡',
  window: '🪟', game: '🎮', process: '⚙️', workflow: '⚡', ai: '✨', extension: '🧩',
};
