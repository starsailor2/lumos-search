import { motion, AnimatePresence } from 'framer-motion';
import { ACTION_LABELS } from '../../shared/types';

interface ActionPanelProps {
  actions: string[];
  selected: number;
  visible: boolean;
  onSelect: (i: number) => void;
  onRun: (action: string) => void;
}

export function ActionPanel({ actions, selected, visible, onSelect, onRun }: ActionPanelProps) {
  return (
    <AnimatePresence>
      {visible && actions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="action-dock"
        >
          {actions.map((act, i) => (
            <button
              key={act}
              type="button"
              className={`action-btn${i === selected ? ' sel' : ''}`}
              onClick={() => onRun(act)}
              onMouseEnter={() => onSelect(i)}
            >
              {ACTION_LABELS[act] || act}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
