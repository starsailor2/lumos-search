import manifest from '../assets/icons/uicons.json';
import '../styles/uicons.css';

const aliases: Record<string, string> = {
  all: 'search', apps: 'app', files: 'file', folders: 'folder', clip: 'clipboard', snippet: 'clipboard',
  system: 'settings', command: 'settings', windows: 'window', games: 'game', workflows: 'workflow',
  websearch: 'web', quicklink: 'link', calc: 'calculator', convert: 'calculator', extension: 'app',
  snippets: 'clipboard', links: 'link', recent: 'history', fav: 'favourite',
  'launch-app': 'open', 'open-external': 'web', 'open-settings': 'settings', 'rebuild-index': 'refresh', 'refresh-index': 'refresh',
  'system-run': 'settings', 'window-focus': 'window', 'window-snap': 'window', 'kill-process': 'close', 'run-workflow': 'workflow',
  'ai-ask': 'ai', 'ai-chat': 'ai', 'pin-favourite': 'favourite', 'scope-clip': 'clipboard',
  'open-data-folder': 'folder', 'set-scope': 'search',
};

export function Icon({ name }: { name: string }) {
  const key = aliases[name] || name;
  const brand = key.startsWith('brand-') && Object.prototype.hasOwnProperty.call(manifest.brands, key.slice(6));
  const kind = brand || Object.prototype.hasOwnProperty.call(manifest.icons, key) ? key : 'file';
  return <i className={`interface-icon uicon-${kind}${brand ? ' brand-icon' : ''}`} data-icon={kind} aria-hidden="true" />;
}

export function applicationIcon(identity: string) {
  const text = identity.toLowerCase();
  for (const brand of ['whatsapp', 'firefox', 'spotify', 'slack', 'discord', 'telegram', 'zoom', 'github', 'skype']) {
    if (text.includes(brand)) return 'brand-' + brand;
  }
  if (text.includes('msedge') || text.includes('microsoftedge') || text.includes('microsoft edge')) return 'brand-microsoft-edge';
  if (text.includes('camera')) return 'camera';
  if (text.includes('calculator')) return 'calculator';
  if (text.includes('explorer') || text.includes('file manager')) return 'folder';
  if (text.includes('notepad')) return 'file';
  if (text.includes('visualstudio') || text.includes('visual studio')) return 'code';
  if (text.includes('chrome')) return 'web';
  return 'app';
}
