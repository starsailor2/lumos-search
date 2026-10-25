import { useEffect, useState, useCallback } from 'react';
import type { Appearance, SearchResponse } from '../types';

export function useLumos() {
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [indexStatus, setIndexStatus] = useState({ status: 'starting', indexed: 0 });

  useEffect(() => {
    const offStatus = window.lumos.onStatus(setIndexStatus);
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

  const search = useCallback(async (q: string): Promise<SearchResponse> => {
    const response = await window.lumos.search(q);
    setIndexStatus({ status: response.status, indexed: response.indexed });
    return response;
  }, []);

  return { appearance, indexStatus, search };
}
