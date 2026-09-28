import type { SearchResult } from '../../shared/types';
import { ICONS } from '../../shared/types';

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

const ICON_CLASS: Record<string, string> = {
  app: 'icon-app', folder: 'icon-folder', file: 'icon-file',
  command: 'icon-command', clipboard: 'icon-clip',
};
const BADGE_CLASS: Record<string, string> = {
  app: 'badge-app', command: 'badge-command', folder: 'badge-folder',
  clipboard: 'badge-clip',
};
const TYPE_LABEL: Record<string, string> = {
  app: 'APP', file: 'FILE', folder: 'DIR', command: 'CMD',
  clipboard: 'CLIP', url: 'URL', calculator: '=', emoji: '😀',
};

interface ResultRowProps {
  item: SearchResult;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onActivate: () => void;
  iconUrl?: string | null;
}

export function ResultRow({ item, index, selected, onSelect, onActivate, iconUrl }: ResultRowProps) {
  const iconCls = ICON_CLASS[item.type] ?? 'icon-default';
  const badgeCls = item.isIntent ? 'badge-intent' : (BADGE_CLASS[item.type] ?? 'badge-default');
  const label = item.isIntent ? 'INTENT' : (TYPE_LABEL[item.type] ?? item.type.toUpperCase());

  return (
    <div
      className={`result-row${selected ? ' sel' : ''}`}
      onClick={onActivate}
      onMouseMove={onSelect}
      onContextMenu={(e) => { e.preventDefault(); onActivate(); }}
    >
      <div className={`row-icon ${iconCls}`}>
        {iconUrl
          ? <img src={iconUrl} alt="" />
          : <span>{item.icon || ICONS[item.type] || '❔'}</span>}
      </div>
      <div className="row-body">
        <div className="row-title">{highlight(item.title, item.matchRanges)}</div>
        <div className="row-sub">{item.subtitle}</div>
      </div>
      <span className={`type-badge ${badgeCls}`}>{label}</span>
    </div>
  );
}
