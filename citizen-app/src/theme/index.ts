// Tokens from docs/Design.md. Status and priority colours are defined once here and used everywhere.
export const colors = {
  primary: '#1D4ED8',
  primaryDark: '#1E3A8A',
  primaryLight: '#DBEAFE',
  navy: '#0F2A4A',
  accent: '#6D28D9',
  accentLight: '#EDE9FE',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  text: '#1E293B',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  success: '#15803D',
  successBg: '#DCFCE7',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',
  info: '#1D4ED8',
  infoBg: '#DBEAFE',
  neutral: '#475569',
  neutralBg: '#F1F5F9',
  overlay: 'rgba(15, 42, 74, 0.45)',
} as const

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const

export const font = {
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
}

export const shadow = {
  card: {
    shadowColor: '#0F2A4A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const

/** Max content width: keeps the phone-first layout centred on tablets and desktop browsers. */
export const MAX_WIDTH = 560

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' | 'critical'
export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: colors.success, bg: colors.successBg },
  warning: { fg: colors.warning, bg: colors.warningBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
  info: { fg: colors.info, bg: colors.infoBg },
  neutral: { fg: colors.neutral, bg: colors.neutralBg },
  accent: { fg: colors.accent, bg: colors.accentLight },
  critical: { fg: '#7F1D1D', bg: '#FECACA' },
}
