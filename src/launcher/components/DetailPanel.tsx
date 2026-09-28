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
          className="detail-card"
        >
          {metaText && (
            <div className="detail-meta-bar">
              {metaText}
            </div>
          )}
          {imageSrc ? (
            <img src={imageSrc} alt="" className="detail-preview-img" />
          ) : (
            <div className="detail-preview-text">{preview}</div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
