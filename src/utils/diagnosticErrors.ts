import type { AIProvider } from '../types';

export type DiagnosticErrorCategory =
  | 'quota_exceeded'
  | 'invalid_key'
  | 'network_error'
  | 'model_unavailable'
  | 'timeout'
  | 'rate_limited'
  | 'unknown';

export interface DiagnosticInsight {
  category: DiagnosticErrorCategory;
  title: string;
  description: string;
  suggestedFix: string;
  severity: 'critical' | 'warning';
}

const PROVIDER_NAMES: Record<string, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  claude: 'Anthropic Claude',
  groq: 'Groq',
  modal: 'Modal',
  zai: 'Z.ai',
  openrouter: 'OpenRouter',
  custom: 'Provider Custom',
};

function providerLabel(p: AIProvider): string {
  return PROVIDER_NAMES[p] || p;
}

function extractHttpStatus(msg: string): number | null {
  const match = msg.match(/\b([45]\d{2})\b/);
  return match ? parseInt(match[1]) : null;
}

export function classifyError(
  provider: AIProvider,
  rawMessage: string
): DiagnosticInsight {
  const msg = rawMessage.toLowerCase();
  const status = extractHttpStatus(msg);
  const name = providerLabel(provider);

  // Invalid API Key
  if (
    (msg.includes('invalid') && (msg.includes('api') || msg.includes('key'))) ||
    msg.includes('unauthorized') ||
    msg.includes('authenticate') ||
    msg.includes('permission') ||
    status === 401 ||
    status === 403
  ) {
    return {
      category: 'invalid_key',
      title: 'Chiave API non valida',
      description: 'La chiave API fornita è stata rifiutata dal provider.',
      suggestedFix: `Verifica che la chiave API per ${name} sia corretta nella sezione "API Keys". Controlla che non ci siano spazi bianchi o caratteri extra.`,
      severity: 'critical',
    };
  }

  // Rate Limited
  if (
    msg.includes('rate') ||
    msg.includes('per minute') ||
    msg.includes('rpm') ||
    msg.includes('too many requests')
  ) {
    return {
      category: 'rate_limited',
      title: 'Limite di richieste raggiunto',
      description: 'Hai superato il numero massimo di richieste per minuto.',
      suggestedFix: 'Attendi qualche secondo e riprova. Se il problema persiste, riduci la concorrenza nelle impostazioni di traduzione.',
      severity: 'warning',
    };
  }

  // Quota Exceeded
  if (
    msg.includes('quota') ||
    msg.includes('limit exceeded') ||
    msg.includes('resource_exhausted') ||
    msg.includes('exhausted') ||
    msg.includes('billing') ||
    msg.includes('credit') ||
    msg.includes('insufficient') ||
    status === 429
  ) {
    return {
      category: 'quota_exceeded',
      title: 'Quota o credito esaurito',
      description: 'Il tuo piano ha raggiunto il limite di utilizzo.',
      suggestedFix: `Accedi alla console di ${name} per verificare lo stato del tuo piano e i limiti di utilizzo. Potrebbe essere necessario attendere il rinnovo o aggiornare il piano.`,
      severity: 'critical',
    };
  }

  // Model Unavailable
  if (
    msg.includes('model not found') ||
    msg.includes('does not exist') ||
    msg.includes('not available') ||
    msg.includes('deprecated') ||
    msg.includes('no model') ||
    status === 404
  ) {
    return {
      category: 'model_unavailable',
      title: 'Modello non disponibile',
      description: 'Il modello selezionato non esiste o è stato ritirato.',
      suggestedFix: `Seleziona un modello diverso per ${name} nella sezione "Modelli & Ruoli". Il modello potrebbe essere stato deprecato o non essere disponibile nel tuo piano.`,
      severity: 'critical',
    };
  }

  // Network Error
  if (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('cors') ||
    msg.includes('dns') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('failed to fetch') ||
    msg.includes('net::')
  ) {
    return {
      category: 'network_error',
      title: 'Errore di rete',
      description: 'Impossibile raggiungere il server del provider.',
      suggestedFix: 'Verifica la tua connessione internet. Se sei dietro un firewall o un proxy, assicurati che permetta le connessioni verso l\'API del provider. Prova a disabilitare eventuali VPN.',
      severity: 'critical',
    };
  }

  // Timeout
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('abort')) {
    return {
      category: 'timeout',
      title: 'Tempo scaduto',
      description: 'Il server ha impiegato troppo tempo per rispondere.',
      suggestedFix: 'Il provider potrebbe essere temporaneamente sovraccarico. Riprova tra qualche istante. Se il problema persiste, prova un modello più leggero (es. flash).',
      severity: 'warning',
    };
  }

  // Unknown
  return {
    category: 'unknown',
    title: 'Errore imprevisto',
    description: rawMessage,
    suggestedFix: `Verifica la configurazione per ${name}. Se il problema persiste, consulta i log nella sezione "Log & Diagnostica".`,
    severity: 'warning',
  };
}
