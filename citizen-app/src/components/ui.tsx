import { useState, type ComponentProps, type ReactNode } from 'react'
import {
  ActivityIndicator, Pressable, StyleSheet, Text as RNText, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { colors, font, radius, shadow, spacing, toneColors, type Tone } from '../theme'
import type { IconName } from '../lib/domain'

export function Icon({ name, size = 20, color = colors.textMuted }: { name: IconName; size?: number; color?: string | import('react-native').ColorValue }) {
  return <MaterialCommunityIcons name={name} size={size} color={color as string} accessible={false} />
}

type Variant = keyof typeof font
export function Text({ variant = 'body', color = colors.text, style, ...rest }: ComponentProps<typeof RNText> & { variant?: Variant; color?: string }) {
  return <RNText {...rest} style={[font[variant], { color }, style as StyleProp<TextStyle>]} />
}

export function Button({
  label, onPress, variant = 'primary', icon, loading, disabled, style,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: IconName
  loading?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const inactive = disabled || loading
  const fg = variant === 'primary' || variant === 'danger' ? '#FFFFFF' : variant === 'secondary' ? colors.primary : colors.textMuted
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: colors.primary },
        variant === 'danger' && { backgroundColor: colors.danger },
        variant === 'secondary' && { backgroundColor: colors.primaryLight },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        pressed && { opacity: 0.85 },
        inactive && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} color={fg} size={20} /> : null}
      <Text variant="h3" color={fg}>{label}</Text>
    </Pressable>
  )
}

export function IconButton({ icon, label, onPress, color = colors.text, badge }: { icon: IconName; label: string; onPress: () => void; color?: string; badge?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.neutralBg }]}>
      <Icon name={icon} size={24} color={color} />
      {badge ? <View style={styles.badgeDot} /> : null}
    </Pressable>
  )
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }, style]}>
      {children}
    </Pressable>
  )
}

export function Input({ label, error, hint, multiline, style, ...rest }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const [focused, setFocused] = useState(false)
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="small" color={colors.textMuted} style={{ fontWeight: '600' }}>{label}</Text>
      <TextInput
        {...rest}
        multiline={multiline}
        accessibilityLabel={label}
        placeholderTextColor={colors.textFaint}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e) }}
        style={[
          styles.input,
          multiline && { minHeight: 110, textAlignVertical: 'top', paddingTop: spacing.md },
          focused && { borderColor: colors.primary },
          !!error && { borderColor: colors.danger },
          style,
        ]}
      />
      {error ? <Text variant="small" color={colors.danger} accessibilityRole="alert">{error}</Text>
        : hint ? <Text variant="small" color={colors.textFaint}>{hint}</Text> : null}
    </View>
  )
}

export function Pill({ label, tone, icon }: { label: string; tone: Tone; icon?: IconName }) {
  const { fg, bg } = toneColors[tone]
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={12} color={fg} /> : null}
      <Text variant="caption" color={fg}>{label}</Text>
    </View>
  )
}

export function Avatar({ name, size = 44 }: { name: string | null; size?: number }) {
  const initial = (name?.trim()[0] ?? '?').toUpperCase()
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="h3" color={colors.primaryDark} style={{ fontSize: size * 0.4 }}>{initial}</Text>
    </View>
  )
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="h3" accessibilityRole="header">{title}</Text>
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="link" hitSlop={8}>
          <Text variant="small" color={colors.primary} style={{ fontWeight: '600' }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function Banner({ tone, icon, children }: { tone: Tone; icon: IconName; children: ReactNode }) {
  const { fg, bg } = toneColors[tone]
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      <Icon name={icon} color={fg} size={20} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  )
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52, borderRadius: radius.md, paddingHorizontal: spacing.xl, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  iconButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  badgeDot: { position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.surface },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, ...shadow.card },
  input: {
    minHeight: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg, fontSize: 16, color: colors.text,
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  banner: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, alignItems: 'flex-start' },
})
