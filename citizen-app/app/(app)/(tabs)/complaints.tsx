import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { complaintsApi } from '../../../src/api/complaints'
import type { Category, Complaint } from '../../../src/api/types'
import { ComplaintCard } from '../../../src/components/complaint'
import { Dialog } from '../../../src/components/Dialog'
import { Screen } from '../../../src/components/Screen'
import { EmptyState, ErrorState, ListSkeleton } from '../../../src/components/feedback'
import { Button, Icon, IconButton, Text } from '../../../src/components/ui'
import { useQuery } from '../../../src/hooks/useApi'
import { useI18n } from '../../../src/i18n'
import type { TranslationKey } from '../../../src/i18n/en'
import { STATUS_GROUPS, categoryKey, errorMessage, type StatusGroup } from '../../../src/lib/domain'
import { colors, radius, spacing } from '../../../src/theme'

const PAGE_SIZE = 50
type SortKey = 'newest' | 'oldest' | 'priority'

const TABS: { key: StatusGroup; label: TranslationKey }[] = [
  { key: 'all', label: 'complaints.tabAll' },
  { key: 'pending', label: 'complaints.tabPending' },
  { key: 'progress', label: 'complaints.tabProgress' },
  { key: 'resolved', label: 'complaints.tabResolved' },
]
const SORTS: { key: SortKey; label: TranslationKey }[] = [
  { key: 'newest', label: 'complaints.sortNewest' },
  { key: 'oldest', label: 'complaints.sortOldest' },
  { key: 'priority', label: 'complaints.sortPriority' },
]

export default function ComplaintsScreen() {
  const { t } = useI18n()
  const router = useRouter()
  const first = useQuery(() => complaintsApi.list({ page_size: PAGE_SIZE }))
  const [more, setMore] = useState<Complaint[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<StatusGroup>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [category, setCategory] = useState<Category | null>(null)
  const [sheet, setSheet] = useState<'sort' | 'filter' | null>(null)

  const reload = first.reload
  useFocusEffect(useCallback(() => { setMore([]); void reload() }, [reload]))

  const loaded = useMemo(() => [...(first.data?.items ?? []), ...more], [first.data, more])
  const total = first.data?.total ?? 0

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const list = loaded.filter((c) => {
      if (tab !== 'all' && !STATUS_GROUPS[tab].includes(c.status)) return false
      if (category && c.category !== category) return false
      if (!needle) return true
      const haystack = [c.code, t(categoryKey(c.category)), c.description, c.location.address].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
    const order = {
      newest: (a: Complaint, b: Complaint) => b.created_at.localeCompare(a.created_at),
      oldest: (a: Complaint, b: Complaint) => a.created_at.localeCompare(b.created_at),
      priority: (a: Complaint, b: Complaint) => b.priority_score - a.priority_score,
    }[sort]
    return [...list].sort(order)
  }, [loaded, tab, category, search, sort, t])

  const counts = useMemo(() => {
    const result: Record<StatusGroup, number> = { all: loaded.length, pending: 0, progress: 0, resolved: 0 }
    for (const c of loaded) for (const g of ['pending', 'progress', 'resolved'] as const) if (STATUS_GROUPS[g].includes(c.status)) result[g]++
    return result
  }, [loaded])

  const usedCategories = useMemo(() => [...new Set(loaded.map((c) => c.category))], [loaded])
  const filtersActive = !!category || sort !== 'newest'

  const refresh = async () => {
    setRefreshing(true)
    setMore([])
    await reload()
    setRefreshing(false)
  }

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const page = Math.floor(loaded.length / PAGE_SIZE) + 1
      const next = await complaintsApi.list({ page, page_size: PAGE_SIZE })
      setMore((current) => [...current, ...next.items])
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.titleRow}>
        <Text variant="h1" accessibilityRole="header">{t('complaints.title')}</Text>
        <View style={{ flexDirection: 'row' }}>
          <IconButton icon="sort" label={t('complaints.sort')} onPress={() => setSheet('sort')} color={sort !== 'newest' ? colors.primary : colors.text} />
          <IconButton icon="filter-variant" label={t('complaints.filter')} onPress={() => setSheet('filter')} color={category ? colors.primary : colors.text} />
        </View>
      </View>

      <View style={styles.search}>
        <Icon name="magnify" size={20} color={colors.textFaint} />
        <TextInput value={search} onChangeText={setSearch} placeholder={t('complaints.searchPlaceholder')} placeholderTextColor={colors.textFaint}
          accessibilityLabel={t('complaints.searchPlaceholder')} style={styles.searchInput} returnKeyType="search" />
        {search ? <Pressable onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={8}><Icon name="close-circle" size={18} color={colors.textFaint} /></Pressable> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} style={{ flexGrow: 0, marginHorizontal: -spacing.lg }} >
        <View style={{ width: spacing.lg - spacing.sm }} />
        {TABS.map(({ key, label }) => {
          const selected = tab === key
          return (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setTab(key)} style={[styles.tab, selected && styles.tabSelected]}>
              <Text variant="small" color={selected ? '#FFFFFF' : colors.text} style={{ fontWeight: '600' }}>{t(label)}</Text>
              {!first.loading ? <Text variant="caption" color={selected ? '#DBEAFE' : colors.textFaint}>{counts[key]}</Text> : null}
            </Pressable>
          )
        })}
        <View style={{ width: spacing.lg - spacing.sm }} />
      </ScrollView>

      {first.loading && !first.data ? <ListSkeleton count={4} />
        : first.error && !first.data ? <ErrorState message={errorMessage(first.error, t)} onRetry={first.reload} />
        : visible.length === 0 ? (
          loaded.length === 0
            ? <EmptyState icon="clipboard-text-outline" title={t('complaints.empty')} body={t('complaints.emptyBody')} actionLabel={t('home.heroCta')} onAction={() => router.push('/report')} />
            : <EmptyState icon="magnify-close" title={t('complaints.emptyFiltered')} body={t('complaints.emptyFilteredBody')} />
        ) : (
          <View style={{ gap: spacing.md }}>
            {visible.map((c) => <ComplaintCard key={c.id} complaint={c} />)}
            {loaded.length < total ? <Button label={t('complaints.loadMore')} variant="secondary" onPress={loadMore} loading={loadingMore} /> : null}
          </View>
        )}

      <Dialog visible={sheet === 'sort'} title={t('complaints.sort')} onClose={() => setSheet(null)}>
        {SORTS.map(({ key, label }) => (
          <Option key={key} label={t(label)} selected={sort === key} onPress={() => { setSort(key); setSheet(null) }} />
        ))}
      </Dialog>
      <Dialog visible={sheet === 'filter'} title={t('complaints.filter')} onClose={() => setSheet(null)}>
        <Option label={t('complaints.allCategories')} selected={category === null} onPress={() => { setCategory(null); setSheet(null) }} />
        {usedCategories.map((c) => <Option key={c} label={t(categoryKey(c))} selected={category === c} onPress={() => { setCategory(c); setSheet(null) }} />)}
      </Dialog>
      {filtersActive ? null : null}
    </Screen>
  )
}

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.option, selected && { backgroundColor: colors.primaryLight }]}>
      <Text variant="h3" color={selected ? colors.primaryDark : colors.text} style={{ flex: 1 }}>{label}</Text>
      {selected ? <Icon name="check" color={colors.primary} size={20} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: spacing.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, height: 40, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.md },
})
