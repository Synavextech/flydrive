import express from 'express'
import { getEvents, getEventById } from '../controllers/eventsController.js'

const router = express.Router()

// GET /api/events - Get all events with optional filtering
router.get('/', getEvents)

// GET /api/events/:id - Get a specific event by ID
router.get('/:id', getEventById)

export default router