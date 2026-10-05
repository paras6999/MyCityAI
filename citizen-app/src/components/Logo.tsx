import { View } from 'react-native'
import { colors } from '../theme'
import { Icon, Text } from './ui'

export function Logo({ size = 64, light = false, showName = true }: { size?: number; light?: boolean; showName?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: size * 0.25 }}>
      <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: light ? '#FFFFFF' : colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="city-variant-outline" size={size * 0.56} color={light ? colors.primary : '#FFFFFF'} />
      </View>
      {showName ? (
        <Text variant="h1" color={light ? '#FFFFFF' : colors.primaryDark} style={{ fontSize: size * 0.42, lineHeight: size * 0.5, letterSpacing: 0.3 }}>
          MyCity<Text variant="h1" color={light ? '#93C5FD' : colors.primary} style={{ fontSize: size * 0.42, lineHeight: size * 0.5 }}>AI</Text>
        </Text>
      ) : null}
    </View>
  )
}

