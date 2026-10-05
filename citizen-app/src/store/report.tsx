import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { AnalyzeResult, Category, PickedPhoto } from '../api/types'
import type { IssueType } from '../lib/domain'

export const REPORT_STEPS = ['category', 'photo', 'location', 'details', 'analysis', 'review'] as const
export type ReportStep = (typeof REPORT_STEPS)[number]

export interface ReportLocation {
  lat: number
  lng: number
  address: string
}

export interface ReportDraft {
  step: ReportStep
  issueType: IssueType | null
  photo: PickedPhoto | null
  location: ReportLocation | null
  description: string
  /** Result of the AI pre-check and the inputs it was computed for (re-run when they change). */
  analysis: { result: AnalyzeResult; key: string } | null
  /** The citizen saw the duplicate warning and chose to continue with a new report. */
  duplicateAcknowledged: boolean
  /** Use the AI-suggested category instead of the citizen's coarse choice. */
  useAiCategory: boolean
  /** Input key for which the citizen chose to continue without AI (analysis was unavailable). */
  skippedKey: string | null
}

const EMPTY: ReportDraft = {
  step: 'category', issueType: null, photo: null, location: null, description: '',
  analysis: null, duplicateAcknowledged: false, useAiCategory: true, skippedKey: null,
}

interface ReportValue {
  draft: ReportDraft
  update: (changes: Partial<ReportDraft>) => void
  reset: () => void
  isDirty: boolean
  /** Category to send to the backend, or undefined to let the AI decide. */
  chosenCategory: (fallback: Category | undefined) => Category | undefined
}

const ReportContext = createContext<ReportValue | null>(null)

/** Lives above the tabs so the draft survives switching tabs while reporting. */
export function ReportProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ReportDraft>(EMPTY)
  const update = useCallback((changes: Partial<ReportDraft>) => setDraft((d) => ({ ...d, ...changes })), [])
  const reset = useCallback(() => setDraft(EMPTY), [])
  const value = useMemo<ReportValue>(
    () => ({
      draft, update, reset,
      isDirty: Boolean(draft.issueType || draft.photo || draft.location || draft.description),
      chosenCategory: (fallback) => (draft.useAiCategory && draft.analysis ? draft.analysis.result.suggested_category : fallback),
    }),
    [draft, update, reset],
  )
  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>
}

export function useReport(): ReportValue {
  const value = useContext(ReportContext)
  if (!value) throw new Error('useReport must be used inside ReportProvider')
  return value
}
