import { Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '../../../src/components/Screen'
import { ScreenHeader } from '../../../src/components/ScreenHeader'
import { useToast } from '../../../src/components/feedback'
import { Card, Divider, Icon, Text } from '../../../src/components/ui'
import { LANGUAGES, useI18n } from '../../../src/i18n'
import { useAuth } from '../../../src/store/auth'
import { colors, spacing } from '../../../src/theme'
import { View } from 'react-native'

export default function LanguageScreen() {
  const { t, language, setLanguage } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const { updateProfile } = useAuth()

  const choose = (code: (typeof LANGUAGES)[number]['code']) => {
    setLanguage(code)
    // Keep the account language in sync so push messages and complaint replies use it (docs/API.md §4.3).
    updateProfile({ language: code }).catch(() => toast.show(t('common.offline'), 'warning'))
    router.back()
  }

  return (
    <Screen>
      <ScreenHeader title={t('lang.title')} />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {LANGUAGES.map((lang, index) => {
          const selected = lang.code === language
          return (
            <View key={lang.code}>
              {index > 0 ? <Divider /> : null}
              <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => choose(lang.code)} style={styles.row}>
                <Text variant="h3" style={{ flex: 1 }}>{lang.label}</Text>
                <Icon name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={selected ? colors.primary : colors.textFaint} />
              </Pressable>
            </View>
          )
        })}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: spacing.lg },
})
