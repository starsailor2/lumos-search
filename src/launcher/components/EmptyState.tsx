import type { SearchResult, LearnedIntent } from '../../shared/types';
import { ICONS } from '../../shared/types';

interface EmptyStateProps {
  items: SearchResult[];
  recentIntents?: LearnedIntent[];
  onActivate: (i: number) => void;
  onSelect: (i: number) => void;
  onSelectIntent?: (query: string) => void;
  selected: number;
}

function groupItems(items: SearchResult[]) {
  const map = new Map<string, { item: SearchResult; index: number }[]>();
  items.forEach((item, index) => {
    let key = 'Suggestions';
    if (item.subtitle?.startsWith('Favourite')) key = 'Favourites';
    else if (item.subtitle?.startsWith('Recent')) key = 'Recents';
    else if (item.subtitle?.startsWith('Clipboard')) key = 'Clipboard';
    else if (item.type === 'command') key = 'Quick Actions';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ item, index });
  });
  return [...map.entries()];
}

const ICON_CLASS: Record<string, string> = {
  app: 'icon-app', folder: 'icon-folder', file: 'icon-file',
  command: 'icon-command', clipboard: 'icon-clip',
};

export function EmptyState({ items, recentIntents, onActivate, onSelect, onSelectIntent, selected }: EmptyStateProps) {
  const hasIntents = Boolean(recentIntents && recentIntents.length > 0);
  const hasItems = items.length > 0;

  if (!hasItems && !hasIntents) {
    return (
      <div className="empty-state">
        <div className="empty-hero">
          <div className="empty-icon">✧</div>
          <p className="empty-title">Ready to search</p>
          <p className="empty-hint">
            Search apps, files, or use <span>@clip</span> · <span>@ai</span> · <span>120 * 4</span>
          </p>
        </div>
      </div>
    );
  }

  const groups = groupItems(items);

  return (
    <div style={{ paddingBottom: 8 }}>
      {hasIntents && (
        <div style={{ marginBottom: 12 }}>
          <div className="section-label">Learned Intents · Memory</div>
          <div className="learned-intents-grid">
            {recentIntents!.map((intent, idx) => (
              <div
                key={intent.query + idx}
                className="intent-card"
                onClick={() => onSelectIntent?.(intent.query)}
                title={`Search "${intent.query}" (Target: ${intent.title})`}
              >
                <div className="row-icon icon-command" style={{ width: 26, height: 26, fontSize: 12 }}>
                  <span>🎯</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="intent-query">{intent.query}</div>
                  <div className="intent-target">{intent.title}</div>
                </div>
                <span className="type-badge badge-intent">INTENT</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {groups.map(([label, rows]) => (
        <div key={label} style={{ marginBottom: 8 }}>
          <div className="section-label">{label}</div>
          {rows.map(({ item, index }) => {
            const isSel = selected === index;
            const iconCls = ICON_CLASS[item.type] ?? 'icon-default';
            return (
              <div
                key={item.id}
                className={`result-row${isSel ? ' sel' : ''}`}
                onClick={() => onActivate(index)}
                onMouseMove={() => onSelect(index)}
              >
                <div className={`row-icon ${iconCls}`}>
                  <span>{item.icon || ICONS[item.type] || '❔'}</span>
                </div>
                <div className="row-body">
                  <div className="row-title">{item.title}</div>
                  <div className="row-sub">{item.subtitle}</div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
