import { useEffect, useMemo, useRef } from 'react'
import { createElement } from 'react'
import { colors, radius } from '../../theme'
import { buildMapHtml } from './mapHtml'
import type { LocationMapProps } from './LocationMap'

export function LocationMap({ pin, others = [], editable = false, height = 240, onPick }: LocationMapProps) {
  const frame = useRef<HTMLIFrameElement | null>(null)
  const state = useMemo(() => ({ center: pin, pin, others, editable }), [pin, others, editable])
  const initialHtml = useRef(buildMapHtml(state)).current
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ type: 'state', state }), '*')
  }, [state])

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'pick') onPickRef.current?.(message.lat, message.lng)
      } catch {
        // Ignore malformed messages.
      }
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [])

  return createElement('iframe', {
    ref: frame,
    srcDoc: initialHtml,
    title: 'Map',
    style: { width: '100%', height, border: `1px solid ${colors.border}`, borderRadius: radius.lg, display: 'block' },
  })
}
