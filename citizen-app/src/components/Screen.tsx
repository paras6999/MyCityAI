import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, MAX_WIDTH, spacing } from '../theme'

/** Page shell: safe areas, phone-width column centred on larger screens, optional pull-to-refresh. */
export function Screen({
  children, scroll = true, refreshing, onRefresh, footer, contentStyle, edges = 'top', keyboard = false,
}: {
  children: ReactNode
  scroll?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  /** Fixed bar under the content (primary action of a step). */
  footer?: ReactNode
  contentStyle?: StyleProp<ViewStyle>
  edges?: 'top' | 'none'
  keyboard?: boolean
}) {
  const insets = useSafeAreaInsets()
  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content, contentStyle]}>{children}</View>
  )
  const inner = (
    <View style={[styles.flex, { paddingTop: edges === 'top' ? insets.top : 0 }]}>
      <View style={styles.column}>{body}</View>
      {footer ? (
        <View style={styles.footerWrap}>
          <View style={[styles.column, styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>{footer}</View>
        </View>
      ) : null}
    </View>
  )
  return (
    <View style={styles.root}>
      {keyboard ? <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{inner}</KeyboardAvoidingView> : inner}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  footerWrap: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  footer: { flex: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
})
