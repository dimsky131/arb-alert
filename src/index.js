import path from 'node:path'
import express from 'express'
import { config } from './config.js'
import { apiRouter } from './controllers/api.js'
import { startEngine, stopEngine } from './engine.js'
import { store } from './services/store.js'
import { createLogger } from './utils/logger.js'

const log = createLogger('server')

const app = express()
app.disable('x-powered-by')
app.use(express.json())

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() })
})

app.use('/api', apiRouter)

const publicDir = new URL('./public/', import.meta.url).pathname
app.use(express.static(publicDir))
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'))
})

const server = app.listen(config.port, '0.0.0.0', () => {
  log.info(`listening on port ${config.port}`)
  startEngine()
})

async function shutdown(signal) {
  log.info(`received ${signal}, shutting down`)
  stopEngine()
  await store.flush()
  server.close(() => process.exit(0))
  // Force exit if close hangs.
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
