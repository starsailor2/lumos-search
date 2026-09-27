import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { SearchResult } from '../../shared/types';
import { ResultRow } from './ResultRow';

interface ResultListProps {
  items: SearchResult[];
  selected: number;
  onSelect: (i: number) => void;
  onActivate: (i: number) => void;
  iconCache: Record<string, string>;
}

export function ResultList({ items, selected, onSelect, onActivate, iconCache }: ResultListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 6,
  });

  if (!items.length) return null;

  return (
    <div ref={parentRef} className="results-scroll">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const item = items[vItem.index];
          const iconKey = item.data?.path ? String(item.data.path) : '';
          return (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vItem.start}px)`,
              }}
            >
              <ResultRow
                item={item}
                index={vItem.index}
                selected={vItem.index === selected}
                onSelect={() => onSelect(vItem.index)}
                onActivate={() => onActivate(vItem.index)}
                iconUrl={iconCache[iconKey]}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
