import { useEffect, useMemo, useRef } from 'react'
import { View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { colors, radius } from '../../theme'
import { buildMapHtml, type MapMarker } from './mapHtml'

export interface LocationMapProps {
  /** The pin (the complaint, or the spot the citizen is choosing). */
  pin: { lat: number; lng: number } | null
  /** Extra markers, e.g. nearby complaints. */
  others?: MapMarker[]
  editable?: boolean
  height?: number
  onPick?: (lat: number, lng: number) => void
}

export function LocationMap({ pin, others = [], editable = false, height = 240, onPick }: LocationMapProps) {
  const ref = useRef<WebView>(null)
  const state = useMemo(() => ({ center: pin, pin, others, editable }), [pin, others, editable])
  const initialHtml = useRef(buildMapHtml(state)).current

  useEffect(() => {
    ref.current?.injectJavaScript(`window.setState && window.setState(${JSON.stringify(state)}); true;`)
  }, [state])

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data)
      if (message.type === 'pick') onPick?.(message.lat, message.lng)
    } catch {
      // Ignore malformed messages.
    }
  }

  return (
    <View style={{ height, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: initialHtml, baseUrl: 'https://localhost/' }}
        onMessage={onMessage}
        javaScriptEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        accessibilityLabel="Map"
      />
    </View>
  )
}
