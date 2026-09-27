import { useCallback, useEffect, useRef, useState } from 'react';
import { SearchBar } from './components/SearchBar';
import { ResultList } from './components/ResultList';
import { ActionPanel } from './components/ActionPanel';
import { DetailPanel } from './components/DetailPanel';
import { FooterHints } from './components/FooterHints';
import { EmptyState } from './components/EmptyState';
import { useLumos } from '../shared/hooks/useLumos';
import type { SearchResult } from '../shared/types';
import '../styles/tokens.css';
import './app.css';

const TEXT_EXTS = new Set(['.txt', '.md', '.json', '.log', '.csv', '.js', '.ts', '.py', '.yml', '.yaml', '.xml', '.ini', '.cfg', '.conf']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

function fmtCount(n: number) {
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n);
}

function formatRelativeDate(mtime: number) {
  if (!mtime) return '';
  const diffSec = Math.floor((Date.now() - mtime) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin + ' min ago';
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return diffHour + (diffHour === 1 ? ' hour ago' : ' hours ago');
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays < 7) return diffDays + (diffDays === 1 ? ' day ago' : ' days ago');
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return diffWeeks + (diffWeeks === 1 ? ' week ago' : ' weeks ago');
  const d = new Date(mtime);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatFileSize(bytes: number) {
  if (bytes == null || bytes < 0) return '';
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  const mb = kb / 1024;
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  const gb = mb / 1024;
  return gb.toFixed(1) + ' GB';
}

export default function App() {
  const { appearance, indexStatus, search } = useLumos();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchResult[]>([]);
  const [sel, setSel] = useState(0);
  const [showActions, setShowActions] = useState(false);
  const [actionSel, setActionSel] = useState(0);
  const [iconCache, setIconCache] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [metaText, setMetaText] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const queryId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const isEmptyQuery = !query.trim();
  const showEmptyState = isEmptyQuery && items.length > 0;
  const showResults = !isEmptyQuery && items.length > 0;

  useEffect(() => {
    if (appearance) {
      document.documentElement.style.setProperty('--accent', appearance.accentColor);
      if (appearance.theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
    }
  }, [appearance]);

  useEffect(() => {
    window.lumos.onShown(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
      doSearch('');
    });
    window.lumos.onSetQuery((q) => { setQuery(q); doSearch(q); });
    window.lumos.onAiResponse((d) => {
      setToast(d.error ? 'AI: ' + d.error : 'AI response copied to clipboard');
      setTimeout(() => setToast(''), 2000);
    });
  }, []);

  const loadIcons = useCallback((results: SearchResult[], myId: number) => {
    results.forEach((it) => {
      if ((it.type === 'file' || it.type === 'folder' || it.type === 'app') && it.data?.path) {
        const p = String(it.data.path);
        window.lumos.getIcon(p, it.type).then((url) => {
          if (myId !== queryId.current || !url) return;
          setIconCache((prev) => ({ ...prev, [p]: url }));
        });
      }
    });
  }, []);

  const doSearch = useCallback(async (q: string) => {
    const my = ++queryId.current;
    const res = await search(q);
    if (my !== queryId.current) return;
    setItems(res.results);
    setSel(0);
    setShowActions(false);
    setActionSel(0);
    loadIcons(res.results, my);
  }, [search, loadIcons]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => doSearch(query), 80);
    return () => clearTimeout(timer.current);
  }, [query, doSearch]);

  useEffect(() => {
    const it = items[sel];
    if (!it || !it.data?.path) {
      setPreview(null);
      setImageSrc(null);
      setMetaText(null);
      return;
    }
    const p = String(it.data.path);

    if (it.type === 'file' || it.type === 'folder') {
      window.lumos.getMeta(p).then((meta) => {
        if (!meta) { setMetaText(null); return; }
        const parts = [];
        if (meta.mtime) parts.push('Modified ' + formatRelativeDate(meta.mtime));
        if (meta.size != null && it.type === 'file') parts.push(formatFileSize(meta.size));
        setMetaText(parts.join(' · '));
      }).catch(() => setMetaText(null));
    } else {
      setMetaText(null);
    }

    const dot = p.lastIndexOf('.');
    const slash = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
    const ext = dot > slash ? p.slice(dot).toLowerCase() : '';
    if (it.type === 'file' && IMAGE_EXTS.has(ext)) {
      setImageSrc('file:///' + p.replace(/\\/g, '/'));
      setPreview(null);
    } else if (it.type === 'file' && TEXT_EXTS.has(ext)) {
      setImageSrc(null);
      window.lumos.previewFile(p).then((t) => setPreview(t));
    } else {
      setPreview(null);
      setImageSrc(null);
    }
  }, [sel, items]);

  const activate = (i: number, actionOverride?: string) => {
    const it = items[i];
    if (!it) return;
    const action = actionOverride || (showActions && it.actions[actionSel]) || it.actions[0];
    window.lumos.runAction(action, it);
    setShowActions(false);
    setActionSel(0);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showActions) { setShowActions(false); e.preventDefault(); return; }
        window.lumos.hide();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        setShowActions((v) => !v);
        setActionSel(0);
        return;
      }
      if (showActions && items[sel]) {
        const acts = items[sel].actions || [];
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          setActionSel((a) => (a + 1) % acts.length);
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          setActionSel((a) => (a - 1 + acts.length) % acts.length);
          return;
        }
      }
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (items[idx]) activate(idx);
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) setSel((s) => (s + 1) % items.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) setSel((s) => (s - 1 + items.length) % items.length); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.altKey) activate(sel, items[sel]?.actions.find((a) => a === 'reveal'));
        else activate(sel, e.ctrlKey ? items[sel]?.actions.find((a) => a === 'reveal') : undefined);
      }
      else if (e.ctrlKey && e.key === ',') { e.preventDefault(); window.lumos.openSettings(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items, sel, showActions, actionSel]);

  const statusText = indexStatus.status === 'ready'
    ? fmtCount(indexStatus.indexed)
    : '…' + fmtCount(indexStatus.indexed);

  const current = items[sel];
  const secondary = current?.actions.find((a) => a !== current.actions[0]);

  return (
    <div id="app-root">
      <SearchBar
        ref={inputRef}
        value={query}
        onChange={setQuery}
        status={statusText}
        onSettings={() => window.lumos.openSettings()}
      />

      <div className="results-scroll">
        {showEmptyState && <EmptyState items={items} selected={sel} onSelect={setSel} onActivate={activate} />}
        {showResults && <ResultList items={items} selected={sel} onSelect={setSel} onActivate={activate} iconCache={iconCache} />}
        {isEmptyQuery && !items.length && <EmptyState items={[]} selected={0} onSelect={() => {}} onActivate={() => {}} />}
      </div>

      <ActionPanel
        actions={current?.actions || []}
        selected={actionSel}
        visible={showActions}
        onSelect={setActionSel}
        onRun={(act) => activate(sel, act)}
      />
      <DetailPanel preview={preview} imageSrc={imageSrc} metaText={metaText} />
      <FooterHints
        primaryAction={current?.actions[0]}
        secondaryAction={secondary}
        visible={items.length > 0}
      />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
