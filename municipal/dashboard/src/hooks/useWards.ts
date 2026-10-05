import { useQuery } from '@tanstack/react-query'

import { getWards } from '../api/wards'

/** All wards plus a lookup by id. Cached for the whole session. */
export function useWards() {
  const query = useQuery({ queryKey: ['wards'], queryFn: getWards, staleTime: Infinity })
  const byId = new Map((query.data ?? []).map((ward) => [ward.id, ward]))
  return { ...query, wards: query.data ?? [], byId }
}
