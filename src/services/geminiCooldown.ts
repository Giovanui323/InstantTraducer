import { log } from './logger';
import {
  GEMINI_COOLDOWN_MS,
} from '../constants';

// Stato globale per il cooldown dei modelli
const modelCooldowns: Record<string, number> = {};
// Global cooldown timestamp (0 means inactive)
let globalGeminiCooldownUntil = 0;

// Enhanced cooldown tracking with statistics
const cooldownStats: Record<string, {
  activationCount: number;
  lastActivationTime: number;
  totalCooldownTime: number;
  reason: string[];
}> = {};

export const isGlobalCooldownActive = (): boolean => {
  if (globalGeminiCooldownUntil > 0 && Date.now() < globalGeminiCooldownUntil) {
    return true;
  }
  if (globalGeminiCooldownUntil > 0) {
    globalGeminiCooldownUntil = 0; // Reset if expired
    log.info("Cooldown Globale Gemini terminato. Riprendo le operazioni.");
  }
  return false;
};

export const resetGeminiCooldowns = () => {
  globalGeminiCooldownUntil = 0;
  // Clear individual models as well
  for (const key of Object.keys(modelCooldowns)) {
    delete modelCooldowns[key];
  }
  log.info("Cooldown Globale Gemini rimosso forzatamente dall'utente.");
};

export const isModelInCooldown = (model: string): boolean => {
  if (isGlobalCooldownActive()) return true;

  const expiry = modelCooldowns[model];
  if (!expiry) return false;
  if (Date.now() > expiry) {
    delete modelCooldowns[model];
    return false;
  }
  return true;
};

export const setModelCooldown = (model: string, reason: string = 'quota/timeout', durationMs: number = GEMINI_COOLDOWN_MS) => {
  const now = Date.now();
  const expiry = now + durationMs;

  // Initialize stats if not exists
  if (!cooldownStats[model]) {
    cooldownStats[model] = {
      activationCount: 0,
      lastActivationTime: 0,
      totalCooldownTime: 0,
      reason: []
    };
  }

  // Update stats
  cooldownStats[model].activationCount++;
  cooldownStats[model].lastActivationTime = now;
  cooldownStats[model].totalCooldownTime += durationMs;
  cooldownStats[model].reason.push(reason);

  // Keep only last 10 reasons
  if (cooldownStats[model].reason.length > 10) {
    cooldownStats[model].reason = cooldownStats[model].reason.slice(-10);
  }

  log.warning(`Attivazione cooldown di ${Math.round(durationMs / 60000)} min per il modello ${model} (${reason}). Stats: ${cooldownStats[model].activationCount} activations`, {
    model,
    reason,
    durationMs,
    activationCount: cooldownStats[model].activationCount,
    totalCooldownTime: cooldownStats[model].totalCooldownTime,
    lastActivationTime: new Date(now).toISOString()
  });

  modelCooldowns[model] = expiry;
};

export const getCooldownStats = (model: string) => {
  return cooldownStats[model] || {
    activationCount: 0,
    lastActivationTime: 0,
    totalCooldownTime: 0,
    reason: []
  };
};

export const isModelInExtendedCooldown = (model: string): boolean => {
  const stats = getCooldownStats(model);
  const now = Date.now();

  // If model has been activated more than 5 times in the last hour, extend cooldown
  if (stats.activationCount >= 5 && now - stats.lastActivationTime < 3600000) {
    log.warning(`[COOLDOWN] Model ${model} has ${stats.activationCount} activations in last hour, extending cooldown`);
    return true;
  }

  return isModelInCooldown(model);
};

export const __resetGeminiCooldownStateForTests = () => {
  for (const k in modelCooldowns) delete modelCooldowns[k];
  for (const k in cooldownStats) delete cooldownStats[k];
  globalGeminiCooldownUntil = 0;
};
