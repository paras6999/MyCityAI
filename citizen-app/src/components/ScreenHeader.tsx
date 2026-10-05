import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useI18n } from '../i18n'
import { spacing } from '../theme'
import { IconButton, Text } from './ui'

/** Header of pushed screens: back button + title. */
export function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  const router = useRouter()
  const { t } = useI18n()
  return (
    <View style={styles.bar}>
      <IconButton icon="arrow-left" label={t('common.back')} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/home')))} />
      <Text variant="h2" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">{title}</Text>
      {right}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: -spacing.sm },
})

