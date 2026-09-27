import { ACTION_LABELS } from '../../shared/types';

interface FooterHintsProps {
  primaryAction?: string;
  secondaryAction?: string;
  visible: boolean;
}

export function FooterHints({ primaryAction, secondaryAction, visible }: FooterHintsProps) {
  if (!visible) return null;
  return (
    <div className="footer">
      <span className="footer-hint">
        <kbd>↵</kbd><span>{ACTION_LABELS[primaryAction || 'open'] || 'Open'}</span>
      </span>
      {secondaryAction && (
        <span className="footer-hint">
          <kbd>Ctrl</kbd><kbd>↵</kbd><span>{ACTION_LABELS[secondaryAction]}</span>
        </span>
      )}
      <span className="footer-hint"><kbd>Tab</kbd><span>Actions</span></span>
      <span className="footer-hint"><kbd>↑↓</kbd><span>Navigate</span></span>
      <span className="footer-hint"><kbd>Esc</kbd><span>Close</span></span>
    </div>
  );
}
