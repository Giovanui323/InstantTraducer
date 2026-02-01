
const time = () => new Date().toLocaleTimeString();

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

export const log = {
  info: (msg: string, data?: unknown) => {
    if (data === undefined) return console.log(`%c[INFO] ${time()} - ${msg}`, 'color: #3b82f6');
    console.groupCollapsed(`%c[INFO] ${time()} - ${msg}`, 'color: #3b82f6');
    console.log(sanitize(data));
    console.groupEnd();
  },
  step: (msg: string, data?: unknown) => {
    if (data === undefined) return console.log(`%c[STEP] ${time()} - ${msg}`, 'color: #94a3b8');
    console.groupCollapsed(`%c[STEP] ${time()} - ${msg}`, 'color: #94a3b8');
    console.log(sanitize(data));
    console.groupEnd();
  },
  success: (msg: string, data?: unknown) => {
    if (data === undefined) return console.log(`%c[SUCCESS] ${time()} - ${msg}`, 'color: #10b981; font-weight: bold');
    console.groupCollapsed(`%c[SUCCESS] ${time()} - ${msg}`, 'color: #10b981; font-weight: bold');
    console.log(sanitize(data));
    console.groupEnd();
  },
  warning: (msg: string, data?: unknown) => {
    if (data === undefined) return console.warn(`[WARNING] ${time()} - ${msg}`);
    console.groupCollapsed(`[WARNING] ${time()} - ${msg}`);
    console.warn(sanitize(data));
    console.groupEnd();
  },
  error: (msg: string, err?: unknown) => {
    console.group(`%c[ERROR] ${time()} - ${msg}`, 'color: #ef4444; font-weight: bold');
    if (err !== undefined) console.error(sanitize(err));
    console.groupEnd();
  },
  wait: (msg: string, data?: unknown) => {
    if (data === undefined) return console.log(`%c[AI-WAIT] ${time()} - ${msg}`, 'color: #f59e0b; font-style: italic');
    console.groupCollapsed(`%c[AI-WAIT] ${time()} - ${msg}`, 'color: #f59e0b; font-style: italic');
    console.log(sanitize(data));
    console.groupEnd();
  },
  recv: (msg: string, data?: unknown) => {
    if (data === undefined) return console.log(`%c[AI-RECV] ${time()} - ${msg}`, 'color: #8b5cf6');
    console.groupCollapsed(`%c[AI-RECV] ${time()} - ${msg}`, 'color: #8b5cf6');
    console.log(sanitize(data));
    console.groupEnd();
  },
  batch: (msg: string, data?: unknown) => {
    if (data === undefined) return console.log(`%c[BATCH] ${time()} - ${msg}`, 'color: #ec4899; font-weight: black; text-transform: uppercase');
    console.groupCollapsed(`%c[BATCH] ${time()} - ${msg}`, 'color: #ec4899; font-weight: black; text-transform: uppercase');
    console.log(sanitize(data));
    console.groupEnd();
  },
  build: (msg: string, data?: unknown) => {
    if (data === undefined) return console.log(`%c[PDF-BUILD] ${time()} - ${msg}`, 'color: #06b6d4; border-left: 3px solid #06b6d4; padding-left: 5px');
    console.groupCollapsed(`%c[PDF-BUILD] ${time()} - ${msg}`, 'color: #06b6d4; border-left: 3px solid #06b6d4; padding-left: 5px');
    console.log(sanitize(data));
    console.groupEnd();
  }
};
