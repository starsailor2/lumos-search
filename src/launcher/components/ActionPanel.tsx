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
          className="flex flex-wrap gap-2 px-[18px] py-2 border-t border-white/[0.07] bg-black/10 overflow-hidden"
        >
          {actions.map((act, i) => (
            <button
              key={act}
              type="button"
              className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                i === selected
                  ? 'bg-accent/40 border-accent/50 text-[#cfe4ff]'
                  : 'bg-accent/15 border-accent/30 text-[#cfe4ff] hover:bg-accent/30'
              }`}
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
