const icons: Record<string, string> = {
  search: new URL('../assets/icons/search.svg', import.meta.url).href,
  app: new URL('../assets/icons/app.svg', import.meta.url).href,
  file: new URL('../assets/icons/file.svg', import.meta.url).href,
  pdf: new URL('../assets/icons/pdf.svg', import.meta.url).href,
  folder: new URL('../assets/icons/folder.svg', import.meta.url).href,
  spreadsheet: new URL('../assets/icons/spreadsheet.svg', import.meta.url).href,
  image: new URL('../assets/icons/image.svg', import.meta.url).href,
  video: new URL('../assets/icons/video.svg', import.meta.url).href,
  audio: new URL('../assets/icons/audio.svg', import.meta.url).href,
  archive: new URL('../assets/icons/archive.svg', import.meta.url).href,
  code: new URL('../assets/icons/code.svg', import.meta.url).href,
  clipboard: new URL('../assets/icons/clipboard.svg', import.meta.url).href,
  web: new URL('../assets/icons/web.svg', import.meta.url).href,
  settings: new URL('../assets/icons/settings.svg', import.meta.url).href,
  window: new URL('../assets/icons/window.svg', import.meta.url).href,
  game: new URL('../assets/icons/game.svg', import.meta.url).href,
  process: new URL('../assets/icons/process.svg', import.meta.url).href,
  workflow: new URL('../assets/icons/workflow.svg', import.meta.url).href,
  ai: new URL('../assets/icons/ai.svg', import.meta.url).href,
  calculator: new URL('../assets/icons/calculator.svg', import.meta.url).href,
};

const aliases: Record<string, string> = {
  all: 'search', apps: 'app', files: 'file', folders: 'folder', clip: 'clipboard', snippet: 'clipboard',
  system: 'settings', command: 'settings', windows: 'window', games: 'game', workflows: 'workflow',
  websearch: 'web', quicklink: 'web', calc: 'calculator', convert: 'calculator', extension: 'app',
};

export function Icon({ name }: { name: string }) {
  const kind = aliases[name] || name;
  return <img className="illustrated-icon" data-icon={icons[kind] ? kind : 'file'}
    src={icons[kind] || icons.file} alt="" draggable={false} aria-hidden="true" />;
}
