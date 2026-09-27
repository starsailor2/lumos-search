import { useEffect, useState, useCallback } from 'react';
import type { Appearance, SearchResponse } from '../shared/types';

export function useLumos() {
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [indexStatus, setIndexStatus] = useState({ status: 'starting', indexed: 0 });

  useEffect(() => {
    window.lumos.onStatus(setIndexStatus);
    window.lumos.onShown((d) => {
      if (d?.appearance) setAppearance(d.appearance);
      else window.lumos.getAppearance().then(setAppearance);
    });
    window.lumos.getAppearance().then(setAppearance);
  }, []);

  const search = useCallback(async (q: string): Promise<SearchResponse> => {
    return window.lumos.search(q);
  }, []);

  return { appearance, indexStatus, search };
}
