import { useEffect, useState, useCallback } from 'react';
import type { Appearance, SearchResponse, IndexStatus } from '../types';

export function useLumos() {
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ status: 'starting', indexed: 0, scanned: 0, startedAt: 0, mode: null, queued: null, unreadable: [], unreadableCount: 0, error: '', lastIndexUpdate: 0 });

  useEffect(() => {
    let receivedStatus = false;
    const offStatus = window.lumos.onStatus((status) => { receivedStatus = true; setIndexStatus(status); });
    window.lumos.getIndexStatus().then((status) => { if (!receivedStatus) setIndexStatus(status); }).catch(console.error);
    const offShown = window.lumos.onShown((d) => {
      if (d?.appearance) setAppearance(d.appearance);
      else window.lumos.getAppearance().then(setAppearance);
    });
    const offAppearance = window.lumos.onAppearance(setAppearance);
    window.lumos.getAppearance().then(setAppearance).catch(console.error);
    return () => { offStatus(); offShown(); offAppearance(); };
  }, []);

  useEffect(() => {
    if (!appearance) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const root = document.documentElement;
      root.dataset.theme = appearance.theme === 'system' ? (media.matches ? 'dark' : 'light') : appearance.theme;
      root.dataset.animations = String(appearance.animations);
      root.style.setProperty('--accent', appearance.accentColor);
      root.style.setProperty('--blur-panel', `blur(${appearance.glassBlur}px)`);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [appearance]);

  const search = useCallback(async (q: string, requestId?: number): Promise<SearchResponse> => {
    const response = await window.lumos.search(q, requestId);
    return response;
  }, []);

  return { appearance, indexStatus, search };
}
