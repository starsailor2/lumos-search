import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLumos } from '../shared/hooks/useLumos';
import { ACTION_LABELS } from '../shared/types';
import type { SearchResult, SearchResponse } from '../shared/types';
import { Icon, applicationIcon } from './Icon';
import '../styles/tokens.css';
import '../styles/fonts.css';
import './app.css';

function ResultIcon({ item }: { item: SearchResult }) {
  const file = item.type === 'file';
  const extension = file ? /\.([^.\\/]+)$/.exec(String(item.data?.path || item.title))?.[1].toLowerCase() || '' : '';
  const fileStyles = [
    { extensions: ['pdf'], tone: 'red', icon: 'pdf' },
    { extensions: ['xls', 'xlsx', 'xlsm', 'csv', 'tsv', 'ods'], tone: 'green', icon: 'spreadsheet' },
    { extensions: ['zip', '7z', 'rar', 'tar', 'gz'], tone: 'yellow', icon: 'archive' },
    { extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'], tone: 'violet', icon: 'image' },
    { extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'html', 'css', 'yml', 'yaml', 'rs', 'go', 'java', 'cs'], tone: 'blue', icon: 'code' },
    { extensions: ['mp3', 'wav', 'flac', 'm4a', 'ogg'], tone: 'pink', icon: 'audio' },
    { extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'], tone: 'red', icon: 'video' },
  ];
  const style = fileStyles.find((entry) => entry.extensions.includes(extension));
  let icon = file ? style?.icon || 'file' : item.type;
  if (item.type === 'app') icon = applicationIcon(String(item.data?.appId || item.title));
  if (item.type === 'command') icon = String(item.data?.scope || item.actions[0] || 'settings');
  if (item.type === 'system') {
    const systemIcons: Record<string, string> = { lock: 'lock', sleep: 'sleep', shutdown: 'power', restart: 'refresh', display: 'window',
      'volume-up': 'volume', 'volume-down': 'volume-down', 'volume-mute': 'muted', 'empty-trash': 'trash' };
    icon = systemIcons[String(item.data?.commandId)] || 'settings';
  }
  const tones: Record<string, string> = { folder: 'yellow', app: 'native', calc: 'green', convert: 'green', clip: 'blue', snippet: 'blue', emoji: 'yellow', websearch: 'blue', quicklink: 'blue', system: 'red', command: 'blue', window: 'blue', process: 'red', workflow: 'yellow', ai: 'violet', game: 'violet', extension: 'green' };
  return <div className="item-icon-box" data-tone={file ? style?.tone || 'blue' : tones[item.type] || 'blue'} aria-hidden="true">
    {item.type === 'emoji' ? <span className="emoji-preview">{String(item.data?.text || '')}</span> :
      <Icon name={icon} />}
    {file && extension && <span className="file-extension">{extension.slice(0, 4).toUpperCase()}</span>}
  </div>;
}

function highlight(title: string, ranges?: [number, number][]) {
  if (!ranges?.length) return title;
  const parts: React.ReactNode[] = [];
  let last = 0;
  ranges.forEach(([start, end], i) => {
    if (start > last) parts.push(title.slice(last, start));
    parts.push(<mark key={i}>{title.slice(start, end)}</mark>);
    last = end;
  });
  if (last < title.length) parts.push(title.slice(last));
  return parts;
}

export default function App() {
  const { search, indexStatus, appearance } = useLumos();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchResult[]>([]);
  const [itemsQuery, setItemsQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [failedSources, setFailedSources] = useState(0);
  const selectedResult = useRef<SearchResult | undefined>(undefined);
  const selectionTouched = useRef(false);
  const previousQuery = useRef<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const wasIndexing = useRef(false);
  const lastIndexRefresh = useRef(0);

  const expand = useCallback((value: boolean) => setExpanded(value), []);

  useLayoutEffect(() => {
    const content = panel.current;
    if (!content) return;
    content.inert = !expanded;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const resize = () => window.lumos.resizeLauncher(
      expanded ? 60 + Math.ceil(content.getBoundingClientRect().height) : 60,
      appearance?.animations !== false && !media.matches,
    );
    const observer = new ResizeObserver(resize);
    observer.observe(content);
    media.addEventListener('change', resize);
    resize();
    return () => { observer.disconnect(); media.removeEventListener('change', resize); };
  }, [expanded, appearance?.animations]);

  useEffect(() => {
    const offShown = window.lumos.onShown(() => {
      ++requestId.current;
      expand(false);
      setQuery(''); setItems([]); setItemsQuery(''); setSelected(0);
      setError(''); setAnswer(''); setShowPreview(false);
      setRefresh((n) => n + 1);
      input.current?.focus();
    });
    const offQuery = window.lumos.onSetQuery((q) => {
      setQuery(q); expand(true); input.current?.focus();
    });
    const offAI = window.lumos.onAiResponse((data) => {
      setError(data.error || ''); setAnswer(data.answer || '');
      expand(true);
    });
    return () => { offShown(); offQuery(); offAI(); };
  }, [expand]);

  useEffect(() => {
    if (wasIndexing.current && indexStatus.status !== 'indexing') setRefresh((n) => n + 1);
    wasIndexing.current = indexStatus.status === 'indexing';
  }, [indexStatus.status]);

  useEffect(() => {
    if (indexStatus.status !== 'indexing' || !indexStatus.indexed) return;
    const timer = setTimeout(() => {
      lastIndexRefresh.current = Date.now();
      setRefresh((n) => n + 1);
    }, Math.max(0, 1000 - (Date.now() - lastIndexRefresh.current)));
    return () => clearTimeout(timer);
  }, [indexStatus.indexed, indexStatus.status]);

  useEffect(() => {
    const id = ++requestId.current;
    setBusy(true); setSearching(true); setError(''); setAnswer('');
    if (previousQuery.current !== query) {
      previousQuery.current = query;
      setSelected(0); selectedResult.current = undefined; selectionTouched.current = false;
    }
    const applyResults = (response: SearchResponse) => {
      if (id !== requestId.current) return;
      const results = response.results || [];
      const previous = selectionTouched.current ? selectedResult.current : undefined;
      const at = previous ? results.findIndex((r) => r.id === previous.id ||
        (r.type === 'app' && previous.type === 'app' && r.title.toLowerCase() === previous.title.toLowerCase())) : -1;
      setSelected(at < 0 ? 0 : at);
      selectedResult.current = results[at < 0 ? 0 : at];
      setItems(results); setItemsQuery(query);
      setBusy(Boolean(response.pending) && !results.length);
      setSearching(Boolean(response.pending));
      setFailedSources(response.failedSources || 0);
    };
    const offProgress = window.lumos.onSearchResults((data) => { if (data.requestId === id) applyResults(data.response); });
    const timer = setTimeout(async () => {
      try {
        const response = await search(query, id);
        if (id !== requestId.current) return;
        applyResults(response);
      } catch (err) {
        if (id === requestId.current) { setItems([]); setError(err instanceof Error ? err.message : 'Search failed. Try again.'); }
      } finally { if (id === requestId.current) { setBusy(false); setSearching(false); } }
    }, 45);
    return () => { offProgress(); clearTimeout(timer); ++requestId.current; };
  }, [query, refresh, search]);

  const visibleItems = query.trim() && !itemsQuery.trim() ? [] : items;
  const item = visibleItems[selected];
  selectedResult.current = item;
  const canPreview = item?.type === 'file' && /\.(txt|md|json|log|csv|js|ts|py|yml|yaml|xml|ini|cfg|conf)$/i.test(String(item.data?.path || ''));
  useEffect(() => {
    if (!expanded || !list.current) return;
    const row = list.current.querySelector('[aria-selected="true"]');
    if (!row) return;
    const viewport = list.current.getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    // Scroll only the results, never the clipped shell containing the input.
    if (bounds.top < viewport.top) list.current.scrollTop -= viewport.top - bounds.top;
    else if (bounds.bottom > viewport.bottom) list.current.scrollTop += bounds.bottom - viewport.bottom;
  }, [selected, visibleItems, expanded]);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    const path = item?.data?.path;
    if (showPreview && typeof path === 'string') {
      window.lumos.previewFile(path).then((text) => { if (!cancelled) setPreview(text); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [item, showPreview]);

  const run = useCallback(async (result: SearchResult | undefined, action?: string) => {
    if (!result || busy || running || itemsQuery !== query) return;
    setRunning(true); setError('');
    try {
      const response = await window.lumos.runAction(action || result.actions?.[0] || 'open', result);
      if (response?.error) setError(response.error);
    } catch (err) { setError(err instanceof Error ? err.message : 'Action failed. Try again.'); }
    finally { setRunning(false); }
  }, [busy, running, itemsQuery, query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (answer || error) { setAnswer(''); setError(''); }
        else if (query) { setQuery(''); expand(false); setShowPreview(false); }
        else if (expanded) expand(false);
        else window.lumos.hide();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault(); expand(!expanded);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        selectionTouched.current = true;
        if (!expanded) expand(true);
        else if (visibleItems.length) setSelected((s) => (s + (e.key === 'ArrowDown' ? 1 : -1) + visibleItems.length) % visibleItems.length);
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (!expanded) expand(true);
        else void run(item, e.shiftKey ? item?.actions?.[1] : undefined);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [query, expanded, visibleItems, item, answer, error, expand, run]);

  return (
    <div className="launcher-container">
      <div className={`launcher${expanded ? ' is-expanded' : ''}`}>
        <header className="search-header">
          <span className="search-icon"><Icon name="all" /></span>
          <input ref={input} className="search-input" aria-label="Search apps, files and commands"
            role="combobox" aria-expanded={expanded} aria-controls="search-results"
            aria-activedescendant={expanded && item ? `result-${selected}` : undefined}
            aria-autocomplete="list" placeholder="Search apps, files, or type @ for a mode…"
            value={query} onChange={(e) => { setQuery(e.target.value); expand(Boolean(e.target.value.trim())); }}
            autoFocus autoComplete="off" spellCheck={false} />
          {expanded || query ? <button className="clear-search" aria-label={query ? 'Clear search' : 'Collapse search'}
            title={query ? 'Clear search' : 'Collapse search'}
            onClick={() => { setQuery(''); expand(false); setShowPreview(false); input.current?.focus(); }}><Icon name="close" /></button> :
            <button className="search-shortcut" onClick={() => { expand(true); input.current?.focus(); }} aria-label="Expand search (Control K)">Ctrl K</button>}
        </header>
        <div className="results-reveal" aria-hidden={!expanded}>
          <div className="results-content" ref={panel}>
            {error && <div className="message error-message" role="alert">{error}</div>}
            {failedSources > 0 && !searching && <div className="message" role="status">Some search sources are unavailable. Search again to retry.</div>}
            {answer ? <div className="ai-answer" tabIndex={0}><div className="answer-label">AI answer · copied to clipboard</div>{answer}</div> :
            <div className="results-pane" id="search-results" role="listbox" aria-label="Search results" aria-busy={searching} ref={list}>
              {!visibleItems.length ? <div className="empty-results">
                <p className="empty-results-title">{busy ? 'Searching…' : indexStatus.status === 'indexing' ? 'Building your index…' : query ? 'No matches found' : 'Ready when you are'}</p>
                <p className="empty-results-hint">{query ? 'Try a shorter name or a different search.' : 'Find a file, open an app, or calculate 12 × 4.'}</p>
                {query && !busy && <button className="action-btn" onClick={() => window.lumos.openSettings('indexing')}>Check indexed folders</button>}
              </div> : visibleItems.map((result, i) => {
                return <div key={result.id} id={`result-${i}`} role="option" aria-selected={selected === i}
                  className={`result-card${selected === i ? ' selected' : ''}`} onClick={() => { selectionTouched.current = true; setSelected(i); void run(result); }}
                  onMouseMove={() => { selectionTouched.current = true; setSelected(i); }} title={result.subtitle}>
                  <ResultIcon item={result} />
                  <div className="item-text"><div className="item-title">{highlight(result.title, result.matchRanges)}</div>
                    <div className="item-subtitle">{result.subtitle}</div></div>
                  {selected === i && <span className="item-enter" aria-hidden="true"><Icon name="enter" /></span>}
                </div>;
              })}
            </div>}
            {showPreview && canPreview && !answer && <div className="file-preview">{preview || 'No text preview available for this item.'}</div>}
            {item && !answer && <div className="action-dock" aria-label="Selected result actions">
              {item.actions.map((action) => <button key={action} className="action-btn" disabled={busy || running} onClick={() => void run(item, action)}><Icon name={action} />{ACTION_LABELS[action] || action}</button>)}
              {canPreview && <button className="action-btn" aria-pressed={showPreview} onClick={() => setShowPreview(!showPreview)}><Icon name="preview" />Preview</button>}
            </div>}
            <footer className="status-bar">
              <button onClick={() => window.lumos.openSettings()} title="Open settings"><Icon name="settings" /> Settings</button>
              <span>{running ? 'Working…' : searching ? 'Searching…' : `${visibleItems.length} ${visibleItems.length === 1 ? 'result' : 'results'}`}</span>
              <button className="index-status" onClick={() => window.lumos.openSettings('indexing')}
                title={indexStatus.error || (indexStatus.lastIndexUpdate ? `Last checked ${new Date(indexStatus.lastIndexUpdate).toLocaleString()}. Open index settings.` : 'Open index settings')}>
                <span role="status">{indexStatus.status === 'indexing' ? `${indexStatus.mode === 'hot' ? 'Refreshing' : 'Scanning'} · ${indexStatus.scanned.toLocaleString()} found` :
                  indexStatus.status === 'error' || indexStatus.unreadable.length ? 'Index needs attention' : `${indexStatus.indexed.toLocaleString()} indexed`}
                  {indexStatus.queued ? ' · scan queued' : ''}</span>
              </button>
              <span className="keyboard-hint"><Icon name="keyboard" /> Arrow keys · Esc close</span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
