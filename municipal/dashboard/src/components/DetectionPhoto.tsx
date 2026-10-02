import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Detection } from '../api/types'

/** Complaint photo with the YOLO detection boxes drawn on top. */
export function DetectionPhoto({ src, alt, detections }: { src: string; alt: string; detections: Detection[] }) {
  const { t } = useTranslation()
  const [showBoxes, setShowBoxes] = useState(true)

  return (
    <div>
      <div className="flex justify-center rounded-lg bg-neutral-bg">
        {/* The wrapper is exactly the size of the image, so boxes can use percentages. */}
        <div className="relative inline-block">
          <img src={src} alt={alt} className="block max-h-96 max-w-full rounded-lg" />
          {showBoxes &&
            detections.map((d, index) => (
              <div
                key={index}
                className="pointer-events-none absolute border-2 border-success"
                style={{
                  left: `${d.box[0] * 100}%`,
                  top: `${d.box[1] * 100}%`,
                  width: `${(d.box[2] - d.box[0]) * 100}%`,
                  height: `${(d.box[3] - d.box[1]) * 100}%`,
                }}
              >
                <span className="absolute -top-5 left-[-2px] whitespace-nowrap rounded-sm bg-success px-1 text-[10px] font-bold uppercase text-white">
                  {t(`category.${d.label}`)} {Math.round(d.confidence * 100)}%
                </span>
              </div>
            ))}
        </div>
      </div>
      {detections.length > 0 && (
        <label className="mt-2 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} />
          {t('ai.showBoxes', { count: detections.length })}
        </label>
      )}
    </div>
  )
}
