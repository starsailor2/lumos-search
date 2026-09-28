import { useCallback, useEffect, useRef, useState } from 'react';
import { useLumos } from '../shared/hooks/useLumos';
import type { SearchResult, LearnedIntent } from '../shared/types';
import './app.css';

function formatRelativeDate(mtime: number) {
  if (!mtime) return '';
  const diffSec = Math.floor((Date.now() - mtime) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin + ' min ago';
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return diffHour + (diffHour === 1 ? ' hour ago' : ' hours ago');
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return diffDays + ' days ago';
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return diffWeeks + (diffWeeks === 1 ? ' week ago' : ' weeks ago');
  const d = new Date(mtime);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function highlight(title: string, ranges?: [number, number][]) {
  if (!ranges?.length) return title;
  const parts: React.ReactNode[] = [];
  let last = 0;
  ranges.forEach(([s, e], i) => {
    if (s > last) parts.push(title.slice(last, s));
    parts.push(<mark key={i}>{title.slice(s, e)}</mark>);
    last = e;
  });
  if (last < title.length) parts.push(title.slice(last));
  return parts;
}

type CategoryId = 'all' | 'apps' | 'files' | 'settings' | 'web' | 'folders';

export default function App() {
  const { search } = useLumos();
  const pillInputRef = useRef<HTMLInputElement>(null);
  const expandedInputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);

  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [items, setItems] = useState<SearchResult[]>([]);
  const [sel, setSel] = useState(0);
  const [iconCache, setIconCache] = useState<Record<string, string>>({});
  const queryId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Expand / Collapse window IPC synchronization
  const triggerExpand = useCallback((shouldExpand: boolean) => {
    setExpanded(shouldExpand);
    if (window.lumos?.setExpanded) {
      window.lumos.setExpanded(shouldExpand);
    }
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
    setItems(res.results || []);
    setSel(0);
    loadIcons(res.results || [], my);
  }, [search, loadIcons]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => doSearch(query), 70);
    return () => clearTimeout(timer.current);
  }, [query, doSearch]);

  // Window shown handler
  useEffect(() => {
    window.lumos?.onShown?.(() => {
      triggerExpand(false);
      setQuery('');
      setActiveCategory('all');
      setSel(0);
      doSearch('');
      setTimeout(() => {
        pillInputRef.current?.focus();
        pillInputRef.current?.select();
      }, 50);
    });

    window.lumos?.onSetQuery?.((q) => {
      setQuery(q);
      triggerExpand(true);
      doSearch(q);
    });
  }, [doSearch, triggerExpand]);

  // Focus input when mode changes
  useEffect(() => {
    if (expanded) {
      setTimeout(() => {
        expandedInputRef.current?.focus();
      }, 30);
    } else {
      setTimeout(() => {
        pillInputRef.current?.focus();
      }, 30);
    }
  }, [expanded]);

  // Calculate Category Counts
  const categories: { id: CategoryId; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'apps', label: 'Apps', count: items.filter((it) => it.type === 'app').length },
    { id: 'files', label: 'Files', count: items.filter((it) => it.type === 'file').length },
    { id: 'settings', label: 'Settings', count: items.filter((it) => it.type === 'system' || it.type === 'command' || it.type === 'process').length },
    { id: 'web', label: 'Web', count: items.filter((it) => it.type === 'websearch' || it.type === 'url' || it.type === 'ai' || it.type === 'calculator').length },
    { id: 'folders', label: 'Folders', count: items.filter((it) => it.type === 'folder').length },
  ];

  // Filter items by category
  const filteredItems = items.filter((it) => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'apps') return it.type === 'app';
    if (activeCategory === 'files') return it.type === 'file';
    if (activeCategory === 'settings') return it.type === 'system' || it.type === 'command' || it.type === 'process';
    if (activeCategory === 'web') return it.type === 'websearch' || it.type === 'url' || it.type === 'ai' || it.type === 'calculator';
    if (activeCategory === 'folders') return it.type === 'folder';
    return true;
  });

  const activate = (i: number) => {
    const it = filteredItems[i];
    if (!it) return;
    const action = it.actions?.[0] || 'open';
    window.lumos?.runAction(action, it);
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (query) {
          setQuery('');
        } else if (expanded) {
          triggerExpand(false);
        } else {
          window.lumos?.hide();
        }
        e.preventDefault();
        return;
      }

      if ((e.ctrlKey && e.key.toLowerCase() === 'k') || e.key === 'F14') {
        e.preventDefault();
        triggerExpand(!expanded);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!expanded) {
          triggerExpand(true);
        } else if (filteredItems.length) {
          setSel((s) => (s + 1) % filteredItems.length);
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredItems.length) {
          setSel((s) => (s - 1 + filteredItems.length) % filteredItems.length);
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (!expanded) {
          triggerExpand(true);
        } else if (filteredItems[sel]) {
          activate(sel);
        }
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        if (!expanded) {
          triggerExpand(true);
          return;
        }
        // Cycle categories
        const catIdx = categories.findIndex((c) => c.id === activeCategory);
        const nextCat = categories[(catIdx + (e.shiftKey ? -1 : 1) + categories.length) % categories.length];
        setActiveCategory(nextCat.id);
        setSel(0);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expanded, query, filteredItems, sel, activeCategory, categories, triggerExpand]);

  const renderCategoryIcon = (id: CategoryId) => {
    switch (id) {
      case 'all':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
          </svg>
        );
      case 'apps':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
        );
      case 'files':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        );
      case 'settings':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        );
      case 'web':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        );
      case 'folders':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        );
    }
  };

  const renderItemIcon = (item: SearchResult) => {
    const p = item.data?.path ? String(item.data.path) : '';
    const iconUrl = iconCache[p];
    if (iconUrl) {
      return <img src={iconUrl} alt="" className="item-icon-img" />;
    }

    if (item.type === 'folder') {
      return (
        <svg viewBox="0 0 24 24" fill="#f5c242" className="item-icon-svg">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    }

    if (item.type === 'file') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="item-icon-svg">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    }

    if (item.type === 'websearch' || item.type === 'url') {
      return (
        <svg viewBox="0 0 24 24" fill="none" className="item-icon-svg">
          <circle cx="12" cy="12" r="10" fill="#4285F4" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#ffffff" strokeWidth="1.5" />
          <line x1="2" y1="12" x2="22" y2="12" stroke="#ffffff" strokeWidth="1.5" />
        </svg>
      );
    }

    if (item.type === 'system' || item.type === 'command' || item.type === 'process') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="#7eb1ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="item-icon-svg">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    }

    // Default App icon
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="#68a5ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="item-icon-svg">
        <polygon points="5 3 19 12 5 21 5 3" fill="rgba(104,165,255,0.25)" />
      </svg>
    );
  };

  const formatSubtitle = (item: SearchResult) => {
    if (item.type === 'app') return 'App';
    if (item.type === 'websearch') return 'Search the web';
    if (item.type === 'system' || item.type === 'command') return 'System command';
    return item.subtitle || (item.type === 'folder' ? 'Folder' : 'File');
  };

  // ══════════════════════════════════════════════════════════
  // RENDER MODE 1: COMPACT PILL (Normal Mode)
  // ══════════════════════════════════════════════════════════
  if (!expanded) {
    return (
      <div className="pill-container">
        <div className="glass-pill" onClick={() => triggerExpand(true)}>
          <svg className="pill-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <div className="pill-cursor" />
          <input
            ref={pillInputRef}
            className="pill-input"
            placeholder="Search anything..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              triggerExpand(true);
            }}
            onClick={() => triggerExpand(true)}
            autoFocus
            spellCheck={false}
          />
          <div className="pill-shortcut" onClick={() => triggerExpand(true)}>
            Ctrl + K
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // RENDER MODE 2: EXPANDED CARD (Two-Column Search Window)
  // ══════════════════════════════════════════════════════════
  return (
    <div className="expanded-card">
      {/* Top Header Search Bar */}
      <div className="card-header">
        <svg className="header-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={expandedInputRef}
          className="header-input"
          placeholder="Search anything..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          spellCheck={false}
        />
        {query ? (
          <button
            className="header-clear-btn"
            onClick={() => {
              setQuery('');
              triggerExpand(false);
            }}
            title="Clear"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : (
          <button
            className="header-clear-btn"
            onClick={() => triggerExpand(false)}
            title="Collapse"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Main Two-Column Body */}
      <div className="card-body">
        {/* Left Sidebar (Categories) */}
        <div className="sidebar">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <div
                key={cat.id}
                className={`sidebar-item${isActive ? ' active' : ''}`}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setSel(0);
                }}
              >
                <span className="sidebar-icon">{renderCategoryIcon(cat.id)}</span>
                <span className="sidebar-label">{cat.label}</span>
                <span className="sidebar-count">{cat.count}</span>
              </div>
            );
          })}
        </div>

        {/* Right Content Area (Results List) */}
        <div className="results-pane" ref={resultsListRef}>
          {filteredItems.length === 0 ? (
            <div className="empty-results">
              <p className="empty-results-title">No matching {activeCategory !== 'all' ? activeCategory : 'results'}</p>
              <p className="empty-results-hint">Press Esc to clear or try another search</p>
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === sel;
              const hasPopout = isSelected && (item.type === 'app' || item.type === 'command' || item.type === 'websearch' || item.type === 'url');
              const modifiedDate = item.data?.mtime ? formatRelativeDate(Number(item.data.mtime)) : '';

              return (
                <div
                  key={item.id}
                  className={`result-card${isSelected ? ' selected' : ''}`}
                  onClick={() => activate(index)}
                  onMouseMove={() => setSel(index)}
                >
                  <div className="item-icon-box">
                    {renderItemIcon(item)}
                  </div>
                  <div className="item-text">
                    <div className="item-title">{highlight(item.title, item.matchRanges)}</div>
                    <div className="item-subtitle">{formatSubtitle(item)}</div>
                  </div>
                  <div className="item-trailing">
                    {modifiedDate && (
                      <span className="item-date">Last modified: {modifiedDate}</span>
                    )}
                    {item.isIntent && (
                      <span className="badge-intent">INTENT</span>
                    )}
                    {hasPopout && (
                      <span className="popout-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="7" y1="17" x2="17" y2="7" />
                          <polyline points="7 7 17 7 17 17" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
