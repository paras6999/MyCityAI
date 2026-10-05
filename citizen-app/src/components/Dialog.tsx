import type { ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { useI18n } from '../i18n'
import { colors, radius, shadow, spacing } from '../theme'
import { Button, Text } from './ui'

/** Centered modal; used instead of Alert.alert, which does nothing on web. */
export function Dialog({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => undefined} accessibilityViewIsModal>
          <Text variant="h2" accessibilityRole="header">{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export function ConfirmDialog({
  visible, title, body, confirmLabel, cancelLabel, destructive, onConfirm, onCancel,
}: {
  visible: boolean; title: string; body?: string; confirmLabel: string; cancelLabel: string
  destructive?: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <Dialog visible={visible} title={title} onClose={onCancel}>
      {body ? <Text color={colors.textMuted}>{body}</Text> : null}
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <Button label={confirmLabel} variant={destructive ? 'danger' : 'primary'} onPress={onConfirm} />
        <Button label={cancelLabel} variant="ghost" onPress={onCancel} />
      </View>
    </Dialog>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  sheet: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md, ...shadow.card },
})
