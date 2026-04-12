import { app } from 'electron'
import { inspect } from 'node:util'
import fs from 'fs'
import path from 'path'

// Helper to manually load env vars in Electron main process
const loadEnv = () => {
  try {
    const root = process.cwd()
    const files = ['.env', '.env.local']
    for (const file of files) {
      const p = path.join(root, file)
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8')
        content.split('\n').forEach(line => {
          const match = line.match(/^([^=]+)=(.*)$/)
          if (match) {
            const key = match[1].trim()
            const val = match[2].trim()
            if (!process.env[key]) {
               process.env[key] = val
            }
          }
        })
      }
    }
  } catch (e) {
    // ignore
  }
}

loadEnv()

const levels = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 }

const envLevel = () => {
  const raw = String(process.env.LOG_LEVEL || '').toLowerCase()
  if (raw in levels) return raw
  return 'info'
}

const redact = (value) => {
  const v = value == null ? value : String(value)
  if (v == null) return v
  if (v.length > 2000) return v.slice(0, 2000) + '…'
  return v.replace(/([A-Za-z0-9]{8,})([A-Za-z0-9]{8,})/g, (_m, a, b) => a + '…')
}

const formatMessage = (value) => {
  try {
    if (value == null) return ''
    if (typeof value === 'string') return redact(value)
    if (value instanceof Error) {
      const msg = `${value.name}: ${redact(value.message)}`
      return value.stack ? `${msg}\n${value.stack}` : msg
    }
    if (typeof value === 'object') {
      const sanitized = sanitize(value)
      return inspect(sanitized, { depth: 6, breakLength: 180, maxArrayLength: 50, compact: true })
    }
    return redact(String(value))
  } catch {
    try { return redact(String(value)) } catch { return '[Unformattable]' }
  }
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
let streams = {
  app: null,
  error: null,
  debug: null
}

let logsDirOverride = null

export const setLogsDir = (dir) => {
  logsDirOverride = dir ? String(dir) : null
  try { closeAllStreams() } catch { }
}

const safeAppVersionForFilename = () => {
  try {
    const v = String(app?.getVersion?.() || '').trim()
    if (!v) return 'unknown'
    return v.replace(/[^0-9A-Za-z._-]+/g, '_')
  } catch {
    return 'unknown'
  }
}

const ensureStream = (type) => {
  const day = new Date().toISOString().slice(0, 10)
  
  // Se è cambiato il giorno, chiudi tutti gli stream vecchi
  if (currentDate !== day) {
    Object.values(streams).forEach(s => {
      if (s) try { s.end() } catch {}
    })
    streams = { app: null, error: null, debug: null }
    currentDate = day
  }

  if (streams[type]) return streams[type]

  try {
    if (!app) return null
    const dir = logsDirOverride || path.join(app.getPath('userData'), 'logs')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    
    const version = safeAppVersionForFilename()
    const file = path.join(dir, `${type}-${day}-v${version}.log`)
    const stream = fs.createWriteStream(file, { flags: 'a' })
    
    // Gestione errori stream per rigenerazione automatica
    stream.on('error', (err) => {
      try { console.error(`Logger stream error (${type}):`, err) } catch {}
      try { stream.end() } catch {}
      if (streams[type] === stream) streams[type] = null
    })

    streams[type] = stream
    return streams[type]
  } catch {
    return null
  }
}

const getLogType = (lvl) => {
  if (lvl === 'error') return 'error'
  if (lvl === 'debug' || lvl === 'trace') return 'debug'
  return 'app'
}

export const closeAllStreams = () => {
  Object.values(streams).forEach(s => {
    if (s) try { s.end() } catch {}
  })
  streams = { app: null, error: null, debug: null }
}

export const createLogger = ({ module = 'APP', toFile = true } = {}) => {
  const threshold = envLevel()
  const should = (lvl) => levels[lvl] >= levels[threshold]
  const write = (lvl, msg, meta) => {
    const line = `${iso()} [${module}] ${lvl.toUpperCase()} ${formatMessage(msg)}` + (meta ? ` ${JSON.stringify(sanitize(meta))}` : '')
    if (lvl === 'error') console.error(line)
    else if (lvl === 'warn') console.warn(line)
    else console.log(line)
    if (toFile) {
      const type = getLogType(lvl)
      const s = ensureStream(type)
      if (s) try { s.write(line + '\n') } catch {}
    }
  }
  return {
    trace: (msg, meta) => { if (should('trace')) write('trace', msg, meta) },
    debug: (msg, meta) => { if (should('debug')) write('debug', msg, meta) },
    info:  (msg, meta) => { if (should('info'))  write('info',  msg, meta) },
    warn:  (msg, meta) => { if (should('warn'))  write('warn',  msg, meta) },
    error: (msg, meta) => { if (should('error')) write('error', msg, meta) }
  }
}
