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

export interface IndexStatus {
  status: string;
  indexed: number;
  scanned: number;
  startedAt: number;
  mode: 'full' | 'hot' | null;
  queued: 'full' | 'hot' | null;
  unreadable: string[];
  unreadableCount: number;
  error: string;
  lastIndexUpdate: number;
}

export interface SearchResponse extends Partial<IndexStatus> {
  pending?: boolean;
  failedSources?: number;
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
  search: (q: string, requestId?: number) => Promise<SearchResponse>;
  onSearchResults: (cb: (data: { requestId: number; response: SearchResponse }) => void) => () => void;
  runAction: (action: string, result: SearchResult) => Promise<{ error?: string } | undefined>;
  hide: () => void;
  previewFile: (path: string) => Promise<string | null>;
  getMeta: (path: string) => Promise<{ mtime: number; size: number } | null>;
  openSettings: (section?: 'indexing') => void;
  getIndexStatus: () => Promise<IndexStatus>;
  getAppearance: () => Promise<Appearance>;
  getRecentIntents: () => Promise<LearnedIntent[]>;
  resizeLauncher: (height: number, animate: boolean) => void;
  onStatus: (cb: (s: IndexStatus) => void) => () => void;
  onShown: (cb: (d?: { appearance?: Appearance }) => void) => () => void;
  onAppearance: (cb: (d: Appearance) => void) => () => void;
  onSetQuery: (cb: (q: string) => void) => () => void;
  onAiResponse: (cb: (d: { error?: string; answer?: string }) => void) => () => void;
}

declare global {
  interface Window {
    lumos: LumosAPI;
  }
}

export const ACTION_LABELS: Record<string, string> = {
  open: 'Open',
  'launch-app': 'Open app',
  reveal: 'Show in Explorer',
  copy: 'Copy',
  paste: 'Paste',
  'open-external': 'Open in browser',
  'open-settings': 'Open Settings',
  'rebuild-index': 'Rebuild Index',
  'refresh-index': 'Refresh folders',
  'set-scope': 'Use this mode',
  'open-data-folder': 'Open data folder',
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
