import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const levels = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 }

const envLevel = () => {
  const raw = String(process.env.LOG_LEVEL || '').toLowerCase()
  if (raw in levels) return raw
  return app.isPackaged ? 'info' : 'debug'
}

const redact = (value) => {
  const v = value == null ? value : String(value)
  if (v == null) return v
  if (v.length > 2000) return v.slice(0, 2000) + '…'
  return v.replace(/([A-Za-z0-9]{8,})([A-Za-z0-9]{8,})/g, (_m, a, b) => a + '…')
}

const sanitize = (obj) => {
  try {
    if (obj == null) return obj
    if (typeof obj === 'string') return redact(obj)
    if (typeof obj !== 'object') return obj
    const clone = Array.isArray(obj) ? [] : {}
    for (const k of Object.keys(obj)) {
      const val = obj[k]
      if (/apiKey|apikey|token|secret/i.test(k)) {
        clone[k] = '[REDACTED]'
      } else {
        clone[k] = sanitize(val)
      }
    }
    return clone
  } catch {
    return obj
  }
}

const iso = () => new Date().toISOString()

let currentDate = ''
let currentStream = null

const ensureStream = () => {
  const day = new Date().toISOString().slice(0, 10)
  if (currentDate === day && currentStream) return currentStream
  try {
    if (!app) return null
    const dir = path.join(app.getPath('userData'), 'logs')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `app-${day}.log`)
    if (currentStream) try { currentStream.end() } catch {}
    currentStream = fs.createWriteStream(file, { flags: 'a' })
    currentDate = day
    return currentStream
  } catch {
    return null
  }
}

export const createLogger = ({ module = 'APP', toFile = true } = {}) => {
  const threshold = envLevel()
  const should = (lvl) => levels[lvl] >= levels[threshold]
  const write = (lvl, msg, meta) => {
    const line = `${iso()} [${module}] ${lvl.toUpperCase()} ${msg}` + (meta ? ` ${JSON.stringify(sanitize(meta))}` : '')
    if (lvl === 'error') console.error(line)
    else if (lvl === 'warn') console.warn(line)
    else console.log(line)
    if (toFile) {
      const s = ensureStream()
      if (s) try { s.write(line + '\n') } catch {}
    }
  }
  return {
    trace: (msg, meta) => { if (should('trace')) write('trace', String(msg), meta) },
    debug: (msg, meta) => { if (should('debug')) write('debug', String(msg), meta) },
    info:  (msg, meta) => { if (should('info'))  write('info',  String(msg), meta) },
    warn:  (msg, meta) => { if (should('warn'))  write('warn',  String(msg), meta) },
    error: (msg, meta) => { if (should('error')) write('error', String(msg), meta) }
  }
}
