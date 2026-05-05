/**
 * Platform settings cache. Pattern lifted from QS10's
 * /src/lib/billing/platform-settings.ts (5-min TTL Map cache).
 *
 * Generic key/value store; callers know which keys exist.
 */

import { db } from "../db/client";
import { platformSettings } from "../db/schema";

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = new Map<string, unknown>();
let cacheLoadedAt = 0;

const DEFAULT_SETTINGS = {
  vat_rate: 0.18,
  default_dunning_intervals_days: [1, 3, 7],
  max_dunning_attempts: 3,
  default_trial_days: 14,
  transaction_fee_rate: 0.005,
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS | (string & {});

export function invalidateSettingsCache(): void {
  cache.clear();
  cacheLoadedAt = 0;
}

async function loadIfStale(): Promise<void> {
  const now = Date.now();
  if (cacheLoadedAt && now - cacheLoadedAt < CACHE_TTL_MS && cache.size > 0) {
    return;
  }

  try {
    const rows = await db.select().from(platformSettings);
    cache = new Map(rows.map((r) => [r.key, r.value]));
    cacheLoadedAt = now;
  } catch (err) {
    console.error("[settings] failed to load:", err);
  }
}

export async function getSetting<T = unknown>(
  key: SettingKey,
): Promise<T | undefined> {
  await loadIfStale();
  const value = cache.get(key);
  if (value !== undefined) {
    return value as T;
  }
  if (key in DEFAULT_SETTINGS) {
    return DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS] as T;
  }
  return undefined;
}

export async function getSettingNumber(
  key: SettingKey,
  fallback?: number,
): Promise<number> {
  const v = await getSetting(key);
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback ?? 0;
}

export async function updateSetting(
  key: string,
  value: unknown,
  options?: { description?: string; category?: string; updatedBy?: string },
): Promise<void> {
  await db
    .insert(platformSettings)
    .values({
      key,
      value: value as object,
      description: options?.description,
      category: options?.category ?? "general",
      updatedBy: options?.updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: {
        value: value as object,
        ...(options?.description && { description: options.description }),
        ...(options?.category && { category: options.category }),
        ...(options?.updatedBy && { updatedBy: options.updatedBy }),
        updatedAt: new Date(),
      },
    });
  invalidateSettingsCache();
}

export async function getAllSettings(): Promise<
  {
    key: string;
    value: unknown;
    description: string | null;
    category: string;
    updatedAt: Date;
  }[]
> {
  return db.select().from(platformSettings);
}

/* ─── Convenience accessors ─── */

export async function getVatRate(): Promise<number> {
  return getSettingNumber("vat_rate", 0.18);
}

export async function getDunningIntervals(): Promise<number[]> {
  const v = await getSetting<number[]>("default_dunning_intervals_days");
  if (Array.isArray(v) && v.every((n) => Number.isFinite(n))) {
    return v;
  }
  return [1, 3, 7];
}

export async function getMaxDunningAttempts(): Promise<number> {
  return getSettingNumber("max_dunning_attempts", 3);
}
