import { Router } from 'express'
import { state } from '../engine.js'
import { store } from '../services/store.js'
import * as telegram from '../services/telegram.js'

export const apiRouter = Router()

apiRouter.get('/state', (_req, res) => {
  res.json({
    startedAt: state.startedAt,
    lastTickAt: state.lastTickAt,
    tickCount: state.tickCount,
    telegramConfigured: telegram.isConfigured(),
    exchanges: state.exchanges,
    spreads: state.spreads,
    settings: store.getSettings(),
    alerts: store.getAlerts(50),
  })
})

apiRouter.get('/alerts', (_req, res) => {
  res.json(store.getAlerts())
})

apiRouter.put('/settings', async (req, res) => {
  try {
    const updated = await store.updateSettings(req.body || {})
    res.json(updated)
  } catch (err) {
    res.status(400).json({ error: String(err?.message || err) })
  }
})
