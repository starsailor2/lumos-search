import { motion, AnimatePresence } from 'framer-motion';

interface DetailPanelProps {
  preview: string | null;
  imageSrc: string | null;
  metaText?: string | null;
}

export function DetailPanel({ preview, imageSrc, metaText }: DetailPanelProps) {
  const hasContent = preview || imageSrc || metaText;
  return (
    <AnimatePresence>
      {hasContent && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-white/[0.07] px-[18px] py-2 max-h-[150px] overflow-y-auto text-[11.5px] text-white/55 whitespace-pre-wrap break-words bg-black/15"
        >
          {metaText && (
            <div className="text-[10px] text-white/40 pb-1 mb-1.5 border-b border-white/[0.06] font-mono">
              {metaText}
            </div>
          )}
          {imageSrc ? <img src={imageSrc} alt="" className="max-w-full max-h-[120px] rounded-md block" /> : preview}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
