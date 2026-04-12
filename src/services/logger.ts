
const time = () => new Date().toLocaleTimeString();

const safeJsonStringify = (value: unknown) => {
  try {
    const seen = new WeakSet<object>()
    return JSON.stringify(
      value,
      (_key, v) => {
        if (v && typeof v === 'object') {
          if (seen.has(v as object)) return '[Circular]'
          seen.add(v as object)
        }
        return v
      },
      2
    )
  } catch {
    try { return String(value) } catch { return '[Unserializable]' }
  }
}

const sanitize = (obj: any, depth: number = 0): any => {
  try {
    if (obj == null) return obj
    if (depth > 3) return Array.isArray(obj) ? '[Array]' : '[Object]'
    if (typeof obj === 'string') return obj.length > 1000 ? obj.slice(0, 1000) + '…' : obj
    if (typeof obj !== 'object') return obj
    
    if (Array.isArray(obj)) {
      if (obj.length > 20) return `[Array(${obj.length})]`
      return obj.map(v => sanitize(v, depth + 1))
    }

    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: obj.message,
        stack: obj.stack,
        ...(obj as any) // Include any custom properties
      }
    }

    const out: any = {}
    const keys = Object.keys(obj)
    if (keys.length > 50) return `[Object(${keys.length} keys)]`

    for (const k of keys) {
      const v = obj[k]
      if (k.length > 3 && (k.includes('Key') || k.includes('Token') || k.includes('Secret') || k.includes('key') || k.includes('token') || k.includes('secret'))) {
        out[k] = '[REDACTED]'
      } else {
        out[k] = sanitize(v, depth + 1)
      }
    }
    return out
  } catch {
    return '[ERROR]'
  }
}


if (typeof window !== 'undefined') {
  window.onerror = (message, source, lineno, colno, error) => {
    try {
      (window as any).electronAPI?.logToMain?.({
        level: 'error',
        message: `[UNHANDLED] ${message}`,
        meta: { source, lineno, colno, stack: error?.stack }
      });
    } catch {}
  };

  window.onunhandledrejection = (event) => {
    try {
      (window as any).electronAPI?.logToMain?.({
        level: 'error',
        message: `[UNHANDLED REJECTION] ${event.reason?.message || event.reason}`,
        meta: { reason: event.reason }
      });
    } catch {}
  };
}

export const log = {
  info: (msg: string, data?: unknown) => {
    if (data === undefined) console.log(`%c[INFO] ${time()} - ${msg}`, 'color: #3b82f6');
    else console.log(`%c[INFO] ${time()} - ${msg}\n${safeJsonStringify(sanitize(data))}`, 'color: #3b82f6');
    try { (window as any).electronAPI?.logToMain?.({ level: 'info', message: msg, meta: sanitize(data) }); } catch {}
  },
  step: (msg: string, data?: unknown) => {
    if (data === undefined) console.log(`%c[STEP] ${time()} - ${msg}`, 'color: #94a3b8');
    else console.log(`%c[STEP] ${time()} - ${msg}\n${safeJsonStringify(sanitize(data))}`, 'color: #94a3b8');
    try { (window as any).electronAPI?.logToMain?.({ level: 'info', message: `[STEP] ${msg}`, meta: sanitize(data) }); } catch {}
  },
  success: (msg: string, data?: unknown) => {
    if (data === undefined) console.log(`%c[SUCCESS] ${time()} - ${msg}`, 'color: #10b981; font-weight: bold');
    else console.log(`%c[SUCCESS] ${time()} - ${msg}\n${safeJsonStringify(sanitize(data))}`, 'color: #10b981; font-weight: bold');
    try { (window as any).electronAPI?.logToMain?.({ level: 'info', message: `[SUCCESS] ${msg}`, meta: sanitize(data) }); } catch {}
  },
  warning: (msg: string, data?: unknown) => {
    if (data === undefined) {
        console.warn(`[WARNING] ${time()} - ${msg}`);
    } else {
        console.warn(`[WARNING] ${time()} - ${msg}\n${safeJsonStringify(sanitize(data))}`);
    }
    // Report to main process
    try {
        (window as any).electronAPI?.logToMain?.({ level: 'warn', message: msg, meta: sanitize(data) });
    } catch {}
  },
  warn: (msg: string, data?: unknown) => log.warning(msg, data),
  debug: (msg: string, data?: unknown) => {
    // Strict verbosity check: only log debug if verbose logs are enabled in storage or env
    try {
        const isVerbose = typeof window !== 'undefined' && localStorage.getItem('verbose_logs') === 'true';
        if (!isVerbose) return;
    } catch {}
    log.step(msg, data);
  },
  error: (msg: string, err?: unknown) => {
    if (err === undefined) console.error(`%c[ERROR] ${time()} - ${msg}`, 'color: #ef4444; font-weight: bold');
    else console.error(`%c[ERROR] ${time()} - ${msg}\n${safeJsonStringify(sanitize(err))}`, 'color: #ef4444; font-weight: bold');
    // Report to main process
    try {
        (window as any).electronAPI?.logToMain?.({ level: 'error', message: msg, meta: sanitize(err) });
    } catch {}
  },
  wait: (msg: string, data?: unknown) => {
    if (data === undefined) console.log(`%c[AI-WAIT] ${time()} - ${msg}`, 'color: #f59e0b; font-style: italic');
    else console.log(`%c[AI-WAIT] ${time()} - ${msg}\n${safeJsonStringify(sanitize(data))}`, 'color: #f59e0b; font-style: italic');
    try { (window as any).electronAPI?.logToMain?.({ level: 'debug', message: `[AI-WAIT] ${msg}`, meta: sanitize(data) }); } catch {}
  },
  recv: (msg: string, data?: unknown) => {
    if (data === undefined) console.log(`%c[AI-RECV] ${time()} - ${msg}`, 'color: #8b5cf6');
    else console.log(`%c[AI-RECV] ${time()} - ${msg}\n${safeJsonStringify(sanitize(data))}`, 'color: #8b5cf6');
    try { (window as any).electronAPI?.logToMain?.({ level: 'debug', message: `[AI-RECV] ${msg}`, meta: sanitize(data) }); } catch {}
  },
  batch: (msg: string, data?: unknown) => {
    if (data === undefined) console.log(`%c[BATCH] ${time()} - ${msg}`, 'color: #ec4899; font-weight: black; text-transform: uppercase');
    else console.log(`%c[BATCH] ${time()} - ${msg}\n${safeJsonStringify(sanitize(data))}`, 'color: #ec4899; font-weight: black; text-transform: uppercase');
    try { (window as any).electronAPI?.logToMain?.({ level: 'info', message: `[BATCH] ${msg}`, meta: sanitize(data) }); } catch {}
  },
  build: (msg: string, data?: unknown) => {
    if (data === undefined) console.log(`%c[PDF-BUILD] ${time()} - ${msg}`, 'color: #06b6d4; border-left: 3px solid #06b6d4; padding-left: 5px');
    else console.log(`%c[PDF-BUILD] ${time()} - ${msg}\n${safeJsonStringify(sanitize(data))}`, 'color: #06b6d4; border-left: 3px solid #06b6d4; padding-left: 5px');
    try { (window as any).electronAPI?.logToMain?.({ level: 'info', message: `[PDF-BUILD] ${msg}`, meta: sanitize(data) }); } catch {}
  }
};
