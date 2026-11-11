import { Request, Response } from 'express'
import { Event, EventsQuery, EventsResponse } from '../types/events.js'
import { supabase } from '../utils/supabase.js'

/**
 * GET /api/events
 * Query real events from Supabase database (zero mock data)
 */
export const getEvents = async (req: Request, res: Response) => {
  try {
    const query = req.query as EventsQuery
    const { view, category, limit = 10, offset = 0 } = query

    let queryBuilder = supabase.from('events').select('*', { count: 'exact' })

    if (category) {
      queryBuilder = queryBuilder.ilike('category', category)
    }

    if (view && view.toLowerCase() !== 'all') {
      const today = new Date().toISOString().slice(0, 10)
      if (view.toLowerCase() === 'upcoming') {
        queryBuilder = queryBuilder.gte('date', today)
      } else if (view.toLowerCase() === 'past') {
        queryBuilder = queryBuilder.lt('date', today)
      }
    }

    const from = Number(offset) || 0
    const limitNum = Number(limit) || 10
    const to = from + limitNum - 1

    queryBuilder = queryBuilder.range(from, to).order('date', { ascending: true })

    const { data, count, error } = await queryBuilder

    if (error) {
      // Return clean empty payload if events table is empty or uninitialized
      console.warn('Notice from Supabase events query:', error.message)
      const emptyResponse: EventsResponse = {
        events: [],
        total: 0,
        hasMore: false
      }
      return res.json(emptyResponse)
    }

    const events: Event[] = (data || []).map((row: any) => ({
      id: String(row.id),
      title: row.title || '',
      description: row.description || '',
      date: row.date || '',
      time: row.time || '',
      location: row.location || '',
      category: row.category || '',
      status: row.status || 'upcoming',
      createdAt: row.created_at || row.createdAt || new Date().toISOString(),
      updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
    }))

    const totalCount = count ?? events.length
    const response: EventsResponse = {
      events,
      total: totalCount,
      hasMore: from + events.length < totalCount
    }

    res.json(response)
  } catch (error) {
    console.error('Error fetching events:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

/**
 * GET /api/events/:id
 * Query single event by ID from Supabase
 */
export const getEventById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error || !data) {
      return res.status(404).json({ error: 'Event not found' })
    }

    const event: Event = {
      id: String(data.id),
      title: data.title || '',
      description: data.description || '',
      date: data.date || '',
      time: data.time || '',
      location: data.location || '',
      category: data.category || '',
      status: data.status || 'upcoming',
      createdAt: data.created_at || data.createdAt || new Date().toISOString(),
      updatedAt: data.updated_at || data.updatedAt || new Date().toISOString()
    }

    res.json(event)
  } catch (error) {
    console.error('Error fetching event by ID:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}