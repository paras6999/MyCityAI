import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Animated, StyleSheet, View, type DimensionValue } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, radius, shadow, spacing, toneColors, type Tone } from '../theme'
import { useI18n } from '../i18n'
import type { IconName } from '../lib/domain'
import { Button, Icon, Text } from './ui'

// ---- Skeleton ---------------------------------------------------------------------------------

export function Skeleton({ width = '100%', height = 16, radius: r = radius.sm }: { width?: DimensionValue; height?: number; radius?: number }) {
  const pulse = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  return <Animated.View style={{ width, height, borderRadius: r, backgroundColor: colors.border, opacity: pulse }} />
}

export function ComplaintCardSkeleton() {
  return (
    <View style={styles.skeletonCard} accessibilityLabel="Loading">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Skeleton width={120} height={14} />
        <Skeleton width={70} height={22} radius={radius.pill} />
      </View>
      <Skeleton width="85%" height={16} />
      <Skeleton width="55%" height={12} />
    </View>
  )
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return <View style={{ gap: spacing.md }}>{Array.from({ length: count }, (_, i) => <ComplaintCardSkeleton key={i} />)}</View>
}

export function FullscreenSpinner() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  )
}

// ---- Error / empty ------------------------------------------------------------------------------

function StateView({ icon, tone, title, body, actionLabel, onAction }: { icon: IconName; tone: Tone; title: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  const { fg, bg } = toneColors[tone]
  return (
    <View style={styles.state}>
      <View style={[styles.stateIcon, { backgroundColor: bg }]}><Icon name={icon} size={30} color={fg} /></View>
      <Text variant="h3" style={{ textAlign: 'center' }}>{title}</Text>
      {body ? <Text variant="small" color={colors.textMuted} style={{ textAlign: 'center' }}>{body}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={{ marginTop: spacing.sm }} /> : null}
    </View>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useI18n()
  return <StateView icon="alert-circle-outline" tone="danger" title={t('common.errorTitle')} body={message ?? t('common.errorBody')} actionLabel={onRetry ? t('common.retry') : undefined} onAction={onRetry} />
}

export function EmptyState({ icon, title, body, actionLabel, onAction }: { icon: IconName; title: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  return <StateView icon={icon} tone="info" title={title} body={body} actionLabel={actionLabel} onAction={onAction} />
}

// ---- Toast --------------------------------------------------------------------------------------

interface ToastContextValue { show: (message: string, tone?: Tone) => void }
const ToastContext = createContext<ToastContextValue>({ show: () => undefined })
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const [toast, setToast] = useState<{ message: string; tone: Tone; id: number } | null>(null)
  const opacity = useRef(new Animated.Value(0)).current
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((message: string, tone: Tone = 'neutral') => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ message, tone, id: Date.now() })
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start()
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null))
    }, 3200)
  }, [opacity])

  const value = useMemo(() => ({ show }), [show])
  const palette = toast ? toneColors[toast.tone === 'neutral' ? 'info' : toast.tone] : null
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && palette ? (
        <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.toast, { top: insets.top + spacing.md, opacity, backgroundColor: colors.navy }]}>
          <View style={[styles.toastDot, { backgroundColor: palette.fg === colors.info ? '#93C5FD' : palette.bg }]} />
          <Text variant="small" color="#FFFFFF" style={{ flex: 1 }}>{toast.message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  )
}

const styles = StyleSheet.create({
  skeletonCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  state: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  stateIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  toast: { position: 'absolute', alignSelf: 'center', left: spacing.lg, right: spacing.lg, maxWidth: 420, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, ...shadow.card, zIndex: 100 },
  toastDot: { width: 8, height: 8, borderRadius: 4 },
})
