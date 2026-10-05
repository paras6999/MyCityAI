import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import Constants from 'expo-constants'
import { Logo } from '../../../src/components/Logo'
import { Screen } from '../../../src/components/Screen'
import { ScreenHeader } from '../../../src/components/ScreenHeader'
import { Card, Text } from '../../../src/components/ui'
import { useI18n } from '../../../src/i18n'
import { colors, spacing } from '../../../src/theme'

/** Static content screens: privacy, help & support, about. */
export default function InfoScreen() {
  const { topic } = useLocalSearchParams<{ topic?: 'privacy' | 'help' | 'about' }>()
  const { t } = useI18n()

  const title = topic === 'help' ? t('info.helpTitle') : topic === 'about' ? t('info.aboutTitle') : t('info.privacyTitle')
  const body = topic === 'help' ? t('info.helpBody') : topic === 'about' ? t('info.aboutBody') : t('info.privacyBody')

  return (
    <Screen>
      <ScreenHeader title={title} />
      {topic === 'about' ? (
        <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg }}>
          <Logo size={72} />
          <Text variant="small" color={colors.textMuted}>{t('app.tagline')}</Text>
        </View>
      ) : null}
      <Card><Text>{body}</Text></Card>
      {topic === 'help' ? (
        <View style={{ gap: spacing.md }}>
          {([['info.faq1q', 'info.faq1a'], ['info.faq2q', 'info.faq2a']] as const).map(([q, a]) => (
            <Card key={q} style={{ gap: spacing.xs }}>
              <Text variant="h3">{t(q)}</Text>
              <Text variant="small" color={colors.textMuted}>{t(a)}</Text>
            </Card>
          ))}
        </View>
      ) : null}
      {topic === 'about' ? (
        <Text variant="caption" color={colors.textFaint} style={{ textAlign: 'center' }}>{t('profile.version', { v: Constants.expoConfig?.version ?? '0.1.0' })}</Text>
      ) : null}
    </Screen>
  )
}
