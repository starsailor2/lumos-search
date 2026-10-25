import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLumos } from '../shared/hooks/useLumos';
import { ACTION_LABELS } from '../shared/types';
import type { SearchResult } from '../shared/types';
import '../styles/tokens.css';
import '../styles/fonts.css';
import './app.css';

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    all: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    app: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
    folder: <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm0 1h18" />,
    clip: <><rect x="5" y="5" width="14" height="16" rx="2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" /></>,
    emoji: <><circle cx="12" cy="12" r="9" /><path d="M8 14a4 4 0 0 0 8 0M8 9h.01M16 9h.01" /></>,
    web: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
    system: <><circle cx="12" cy="12" r="3" /><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 1 3h4l1-3 3-1 2-3-2-2 1-3-3-2-1-3Z" /></>,
    window: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></>,
    game: <><path d="M7 7h10c3 0 5 10 3 11-2 1-4-3-5-3H9c-1 0-3 4-5 3C2 17 4 7 7 7Z" /><path d="M6 11h4M8 9v4M16 11h.01M18 13h.01" /></>,
    process: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    workflow: <><rect x="8" y="2" width="8" height="5" rx="1" /><rect x="2" y="17" width="8" height="5" rx="1" /><rect x="14" y="17" width="8" height="5" rx="1" /><path d="M12 7v5M6 17v-5h12v5" /></>,
    ai: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />,
    calc: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M8 6h8M8 11h1M15 11h1M8 15h1M15 15h1M8 19h1M15 19h1" /></>,
  };
  const aliases: Record<string, string> = { apps: 'app', files: 'file', folders: 'folder', clipboard: 'clip', settings: 'system', windows: 'window', games: 'game', workflows: 'workflow', websearch: 'web', quicklink: 'web', command: 'system', snippet: 'clip', convert: 'calc' };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[aliases[name] || name] || paths.file}</svg>;
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
  const icons = useRef(new Map<string, string>());
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchResult[]>([]);
  const [itemsQuery, setItemsQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [iconCache, setIconCache] = useState<Record<string, string>>({});
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
    setBusy(true); setError(''); setSelected(0); setAnswer('');
    const timer = setTimeout(async () => {
      try {
        const response = await search(query);
        if (id !== requestId.current) return;
        setItems(response.results || []);
        setItemsQuery(query);
        setBusy(false);
        const updates: Record<string, string> = {};
        let nextIcon = 0;
        const results = response.results || [];
        await Promise.all(Array.from({ length: Math.min(6, results.length) }, async () => {
          while (id === requestId.current && nextIcon < results.length) {
            const item = results[nextIcon++];
            const path = typeof item.data?.path === 'string' ? item.data.path : '';
            if (!path) continue;
            const url = icons.current.get(path) || await window.lumos.getIcon(path, item.type).catch(() => null);
            if (url) {
              if (icons.current.size >= 400) icons.current.delete(icons.current.keys().next().value!);
              icons.current.set(path, url); updates[path] = url;
            }
          }
        }));
        if (id === requestId.current) setIconCache(updates);
      } catch (err) {
        if (id === requestId.current) { setItems([]); setError(err instanceof Error ? err.message : 'Search failed. Try again.'); }
      } finally { if (id === requestId.current) setBusy(false); }
    }, 45);
    return () => { clearTimeout(timer); ++requestId.current; };
  }, [query, refresh, search]);

  const visibleItems = query.trim() && !itemsQuery.trim() ? [] : items;
  const item = visibleItems[selected];
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
    if (!result || busy || running) return;
    setRunning(true); setError('');
    try {
      const response = await window.lumos.runAction(action || result.actions?.[0] || 'open', result);
      if (response?.error) setError(response.error);
    } catch (err) { setError(err instanceof Error ? err.message : 'Action failed. Try again.'); }
    finally { setRunning(false); }
  }, [busy, running]);

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
            onClick={() => { setQuery(''); expand(false); setShowPreview(false); input.current?.focus(); }}>×</button> :
            <button className="search-shortcut" onClick={() => { expand(true); input.current?.focus(); }} aria-label="Expand search (Control K)">Ctrl K</button>}
        </header>
        <div className="results-reveal" aria-hidden={!expanded}>
          <div className="results-content" ref={panel}>
            {error && <div className="message error-message" role="alert">{error}</div>}
            {answer ? <div className="ai-answer" tabIndex={0}><div className="answer-label">AI answer · copied to clipboard</div>{answer}</div> :
            <div className="results-pane" id="search-results" role="listbox" aria-label="Search results" aria-busy={busy} ref={list}>
              {!visibleItems.length ? <div className="empty-results">
                <p className="empty-results-title">{busy ? 'Searching…' : indexStatus.status === 'indexing' ? 'Building your index…' : query ? 'No matches found' : 'Ready when you are'}</p>
                <p className="empty-results-hint">{query ? 'Try a shorter name or a different search.' : 'Find a file, open an app, or calculate 12 × 4.'}</p>
              </div> : visibleItems.map((result, i) => {
                const iconPath = typeof result.data?.path === 'string' ? result.data.path : '';
                return <div key={result.id} id={`result-${i}`} role="option" aria-selected={selected === i}
                  className={`result-card${selected === i ? ' selected' : ''}`} onClick={() => { setSelected(i); void run(result); }}
                  onMouseMove={() => setSelected(i)} title={result.subtitle}>
                  <div className="item-icon-box">{iconCache[iconPath] ? <img src={iconCache[iconPath]} alt="" className="item-icon-img" /> : <Icon name={result.type} />}</div>
                  <div className="item-text"><div className="item-title">{highlight(result.title, result.matchRanges)}</div>
                    <div className="item-subtitle">{result.subtitle}</div></div>
                  {selected === i && <span className="item-enter" aria-hidden="true">↵</span>}
                </div>;
              })}
            </div>}
            {showPreview && !answer && <div className="file-preview">{preview || 'No text preview available for this item.'}</div>}
            {item && !answer && <div className="action-dock" aria-label="Selected result actions">
              {item.actions.map((action) => <button key={action} className="action-btn" disabled={busy || running} onClick={() => void run(item, action)}>{ACTION_LABELS[action] || action}</button>)}
              {item.data?.path != null && <button className="action-btn" aria-pressed={showPreview} onClick={() => setShowPreview(!showPreview)}>Preview</button>}
            </div>}
            <footer className="status-bar">
              <button onClick={() => window.lumos.openSettings()} title="Open settings">Settings</button>
              <span role="status">{running ? 'Working…' : busy ? 'Searching…' : `${visibleItems.length} results`} · {indexStatus.indexed.toLocaleString()} indexed{indexStatus.status === 'indexing' ? ' · indexing…' : indexStatus.status === 'error' ? ' · scan failed; retry in Settings' : ''}</span>
              <span className="keyboard-hint">↑↓ select · Esc close</span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
