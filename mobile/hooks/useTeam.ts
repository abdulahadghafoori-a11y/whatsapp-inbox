import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import type { Agent } from '@/types'

interface TeamResponse {
  members: Agent[]
  aiAgents: { id: string; name: string }[]
}

export function useTeam() {
  return useQuery({
    queryKey: ['team'],
    queryFn: async () => {
      const res = await api.get<TeamResponse>('/team')
      return res.data
    },
  })
}
