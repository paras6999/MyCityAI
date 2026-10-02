import { api } from './client'
import type { ListResponse, Ward } from './types'

export async function getWards(): Promise<Ward[]> {
  const { data } = await api.get<ListResponse<Ward>>('/wards')
  return data.items
}
