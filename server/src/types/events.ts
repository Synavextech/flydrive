export interface Event {
  id: string
  title: string
  description: string
  date: string
  time: string
  location: string
  category: string
  status: 'upcoming' | 'past' | 'cancelled'
  createdAt: string
  updatedAt: string
}

export interface EventsQuery {
  view?: string
  category?: string
  limit?: number
  offset?: number
}

export interface EventsResponse {
  events: Event[]
  total: number
  hasMore: boolean
}