import type { SearchResult } from '../../shared/types';
import { ICONS } from '../../shared/types';

interface EmptyStateProps {
  items: SearchResult[];
  onActivate: (i: number) => void;
  onSelect: (i: number) => void;
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

export function EmptyState({ items, onActivate, onSelect, selected }: EmptyStateProps) {
  if (!items.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">✨</div>
        <p className="empty-title">Search apps, files, and commands</p>
        <p className="empty-hint">
          Try <span>@clip</span> · <span style={{ color: 'var(--accent-2)' }}>@emoji</span> · <span>120 × 4</span> · <span style={{ color: 'var(--accent-2)' }}>@ai</span>
        </p>
      </div>
    );
  }

  const groups = groupItems(items);
  return (
    <div>
      {groups.map(([label, rows]) => (
        <div key={label}>
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
