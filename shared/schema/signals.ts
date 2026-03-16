import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Zod schemas (match SignalData / SignalTrackingData) ───────────────────

export const signalTargetEntrySchema = z.object({
  price: z.number().optional(),
  percentage: z.number().optional(),
  take_off_percent: z.number().optional(),
  raise_stop_loss: z
    .object({ price: z.number().optional(), percentage: z.number().optional() })
    .optional(),
});

/** Validates payload that becomes Signal.data (core plan + entry). */
export const signalDataSchema = z.object({
  ticker: z.string(),
  instrument_type: z.string(),
  direction: z.string(),
  entry_price: z.number().nullable(),
  expiration: z.string().optional(),
  strike: z.number().optional(),
  right: z.string().optional(),
  underlying_ticker: z.string().nullable().optional(),
  leverage: z.number().optional(),
  leverage_direction: z.string().optional(),
  targets: z.record(signalTargetEntrySchema).optional(),
  stop_loss: z.number().optional(),
  stop_loss_percentage: z.number().optional(),
  time_stop: z.string().optional(),
  auto_track: z.boolean().optional(),
  underlying_price_based: z.boolean().optional(),
  entry_underlying_price: z.number().nullable().optional(),
  entry_letf_price: z.number().nullable().optional(),
  entry_option_price: z.number().nullable().optional(),
  discord_webhook_url: z.string().nullable().optional(),
});

const signalHitTargetEntrySchema = z.object({
  price: z.number().optional(),
  profitPct: z.number().optional(),
  takeOffPercent: z.number().optional(),
});

/** Validates tracking state (updated by trade-monitor). */
export const signalTrackingDataSchema = z.object({
  entry_instrument_price: z.number().nullable().optional(),
  entry_tracking_price: z.number().nullable().optional(),
  current_stop_loss: z.number().optional(),
  hit_targets: z.record(signalHitTargetEntrySchema).optional(),
  current_target_number: z.number().optional(),
  current_tp_number: z.number().optional(),
  next_target_number: z.number().optional(),
  remain_quantity: z.number().optional(),
  status: z.string().optional(),
  current_tracking_price: z.number().nullable().optional(),
  current_instrument_price: z.number().nullable().optional(),
  current_stop_loss_is_break_even: z.boolean().optional(),
  risk_value: z.string().optional(),
  current_stop_loss_percent: z.number().nullable().optional(),
});

/** Validates full Signal.data (core + tracking). */
export const storedSignalDataSchema = signalDataSchema.merge(signalTrackingDataSchema);

const VALID_DIRECTIONS_OPTIONS = ["Call", "Put"];
const VALID_DIRECTIONS_DEFAULT = ["Long", "Short"];

/** Request body for POST /api/ingest/signals (camelCase, maps to SignalData). */
export const ingestSignalBodySchema = z
  .object({
    ticker: z.string().min(1, "ticker is required"),
    instrumentType: z.enum(["Options", "Shares", "LETF", "LETF Option", "Crypto"]),
    direction: z.string(),
    entryPrice: z.union([z.number(), z.string()]).optional().nullable(),
    expiration: z.string().optional(),
    strike: z.union([z.number(), z.string()]).optional(),
    targets: z.record(signalTargetEntrySchema).optional(),
    stop_loss: z.union([z.number(), z.string()]).optional(),
    time_stop: z.string().optional(),
    auto_track: z.boolean().optional(),
    underlying_price_based: z.boolean().optional(),
    underlying_ticker: z.string().nullable().optional(),
    leverage: z.union([z.number(), z.string()]).optional(),
  })
  .superRefine((data, ctx) => {
    const validDirections =
      data.instrumentType === "Options" || data.instrumentType === "LETF Option"
        ? VALID_DIRECTIONS_OPTIONS
        : VALID_DIRECTIONS_DEFAULT;
    if (!data.direction || !validDirections.includes(data.direction)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `direction must be one of: ${validDirections.join(", ")}`,
        path: ["direction"],
      });
    }
    if (data.instrumentType === "Options" || data.instrumentType === "LETF Option") {
      if (!data.expiration) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `expiration is required for ${data.instrumentType}`,
          path: ["expiration"],
        });
      }
      if (data.strike == null || data.strike === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `strike is required for ${data.instrumentType}`,
          path: ["strike"],
        });
      }
    }
    if (data.entryPrice != null && data.entryPrice !== "") {
      const n = Number(data.entryPrice);
      if (isNaN(n) || n <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "entryPrice must be a positive number",
          path: ["entryPrice"],
        });
      }
    }
    if (data.stop_loss != null && data.stop_loss !== "") {
      const n = Number(data.stop_loss);
      if (isNaN(n) || n <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "stop_loss must be a positive number",
          path: ["stop_loss"],
        });
      }
    }
    if (data.time_stop != null && data.time_stop !== "") {
      if (typeof data.time_stop !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.time_stop)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "time_stop must be a date string in YYYY-MM-DD format",
          path: ["time_stop"],
        });
      }
    }
    if (data.auto_track != null && typeof data.auto_track !== "boolean") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "auto_track must be a boolean (true or false)",
        path: ["auto_track"],
      });
    }
    if (
      data.underlying_price_based != null &&
      typeof data.underlying_price_based !== "boolean"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "underlying_price_based must be a boolean (true or false)",
        path: ["underlying_price_based"],
      });
    }
    if (data.targets != null && typeof data.targets === "object" && !Array.isArray(data.targets)) {
      for (const [key, val] of Object.entries(data.targets)) {
        const t = val as z.infer<typeof signalTargetEntrySchema>;
        if (!t || typeof t !== "object") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `targets.${key} must be an object with a price field`,
            path: ["targets", key],
          });
          continue;
        }
        if (t.price != null && (isNaN(Number(t.price)) || Number(t.price) <= 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `targets.${key}.price must be a positive number`,
            path: ["targets", key, "price"],
          });
        }
        if (t.take_off_percent != null) {
          const pct = Number(t.take_off_percent);
          if (isNaN(pct) || pct < 0 || pct > 100) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `targets.${key}.take_off_percent must be a number between 0 and 100`,
              path: ["targets", key, "take_off_percent"],
            });
          }
        }
        if (t.raise_stop_loss != null && typeof t.raise_stop_loss === "object") {
          const rsl = t.raise_stop_loss;
          if (rsl.price != null && (isNaN(Number(rsl.price)) || Number(rsl.price) <= 0)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `targets.${key}.raise_stop_loss.price must be a positive number`,
              path: ["targets", key, "raise_stop_loss", "price"],
            });
          }
        }
      }
    }
  });

// ─── Interfaces (mirror Zod for TypeScript) ─────────────────────────────────

/** Hit target record written by trade-monitor when a TP is hit */
export interface SignalHitTargetEntry {
  price?: number;
  profitPct?: number;
  takeOffPercent?: number;
}

/** Target / TP entry shape within targets map */
export interface SignalTargetEntry {
  price?: number;
  percentage?: number;
  take_off_percent?: number;
  raise_stop_loss?: { price?: number; percentage?: number };
}

/**
 * Core signal definition (trade plan and entry). Set at creation, mostly immutable.
 * Used by signal-processor when building and by Discord for display.
 */
export interface SignalData {
  ticker: string;
  instrument_type: string;
  direction: string;
  entry_price: number | null;
  /** Option/LETF Option: expiration date */
  expiration?: string;
  strike?: number;
  right?: string;
  /** LETF / LETF Option */
  underlying_ticker?: string | null;
  leverage?: number;
  leverage_direction?: string;
  targets?: Record<string, SignalTargetEntry>;
  stop_loss?: number;
  stop_loss_percentage?: number;
  time_stop?: string;
  auto_track?: boolean;
  underlying_price_based?: boolean;
  entry_underlying_price?: number | null;
  entry_letf_price?: number | null;
  entry_option_price?: number | null;
  discord_webhook_url?: string | null;
}

/**
 * Runtime tracking state. Updated by trade-monitor as price moves and TPs/SL hit.
 */
export interface SignalTrackingData {
  /** Entry snapshot: instrument price (option premium / LETF price) at signal creation */
  entry_instrument_price?: number | null;
  /** Entry snapshot: price used for TP/SL comparison when underlying_price_based */
  entry_tracking_price?: number | null;
  /** Current stop level (may be raised from initial stop_loss) */
  current_stop_loss?: number;
  /** Records per target when hit (price, profitPct, takeOffPercent) */
  hit_targets?: Record<string, SignalHitTargetEntry>;
  current_target_number?: number;
  current_tp_number?: number;
  next_target_number?: number;
  remain_quantity?: number;
  status?: string;
  current_tracking_price?: number | null;
  current_instrument_price?: number | null;
  current_stop_loss_is_break_even?: boolean;
  risk_value?: string;
  current_stop_loss_percent?: number | null;
}

/**
 * Full shape stored in Signal.data (jsonb): core signal + tracking state.
 */
export type StoredSignalData = SignalData & SignalTrackingData;

export const signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  data: jsonb("data").$type<StoredSignalData>().notNull().default({} as StoredSignalData),
  discordChannelId: varchar("discord_channel_id"),
  status: text("status").notNull().default("active"),
  sourceAppId: varchar("source_app_id"),
  sourceAppName: text("source_app_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSignalSchema = createInsertSchema(signals, {
  data: storedSignalDataSchema,
}).omit({
  id: true,
  createdAt: true,
});

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = z.infer<typeof insertSignalSchema>;
