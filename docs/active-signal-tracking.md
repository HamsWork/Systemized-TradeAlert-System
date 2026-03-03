# Active Signal Tracking — Detailed Code Walkthrough

This document explains how the system tracks "active" signals and evaluates targets/stop loss, with direct code references.

---

## 1. Where "active" lives: the database

**File:** `shared/schema/signals.ts`

```ts
export const signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  data: jsonb("data").notNull().default({}),
  discordChannelId: varchar("discord_channel_id"),
  status: text("status").notNull().default("active"),   // ← "active" | "completed" | "stopped_out"
  sourceAppId: varchar("source_app_id"),
  sourceAppName: text("source_app_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- Every signal row has a **`status`** field. Default is **`"active"`**.
- Only rows with **`status === "active"`** are considered for target/stop monitoring.
- When stop loss is hit → status becomes **`"stopped_out"`**.
- When all targets are hit → status becomes **`"completed"`**.

---

## 2. New signals start as active

**File:** `server/services/signal-processor.ts` (around 369–378)

When a signal is ingested via `/api/ingest/signals`, it is created with **`status: "active"`**:

```ts
  const signalPayload = {
    data: signalDataObj,
    discordChannelId: body.discordChannelId || null,
    status: "active",           // ← new signals are active
    sourceAppId: sourceId,
    sourceAppName: sourceName,
  };

  const parsed = insertSignalSchema.parse(signalPayload);
  const signal = await storage.createSignal(parsed);
```

So "tracking" applies to any signal that was created and never moved to `completed` or `stopped_out`.

---

## 3. Who runs the tracking: the trade monitor

**File:** `server/index.ts` (around 131–132)

The trade monitor is started once when the server boots:

```ts
  const { startTradeMonitor } = await import("./services/trade-monitor");
  startTradeMonitor();
```

**File:** `server/services/trade-monitor.ts` (106–127)

- A **module-level interval** runs **every 10 seconds**.
- **In-memory map** `hitTargets` stores, per signal id, which target keys (and `"stop_loss"`) have already been processed.

```ts
const MONITOR_INTERVAL = 10000;
let monitorInterval: ReturnType<typeof setInterval> | null = null;
const hitTargets = new Map<string, Set<string>>();   // signalId → Set<"tp1"|"tp2"|"stop_loss"|...>

async function checkActiveTrades(): Promise<void> {
  try {
    const allSignals = await storage.getSignals();
    const activeSignals = allSignals.filter((s) => s.status === "active");   // ← only active

    if (activeSignals.length === 0) return;

    for (const signal of activeSignals) {
      try {
        await checkSignalTargets(signal);
      } catch (err: any) {
        console.error(`[TradeMonitor] Error checking signal ${signal.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.error(`[TradeMonitor] Monitor cycle error: ${err.message}`);
  }
}
```

So **"tracking active signals"** in code is:

1. `storage.getSignals()` → all signals.
2. `.filter((s) => s.status === "active")` → only active ones.
3. For each, `checkSignalTargets(signal)`.

---

## 4. Per-signal check: only if there is a filled entry

**File:** `server/services/trade-monitor.ts` (129–142)

For each active signal we **only** run target/stop logic if there is a **filled market entry** order and a valid **last price**:

```ts
async function checkSignalTargets(signal: Signal): Promise<void> {
  const data = signal.data as Record<string, any>;
  const ticker = data.ticker;
  if (!ticker) return;

  const orders = await storage.getIbkrOrdersBySignal(signal.id);
  const filledEntry = orders.find(
    (o) => o.status === "filled" && o.orderType === "market",
  );

  if (!filledEntry) return;   // ← no filled entry → skip (no position to track)

  const currentPrice = filledEntry.lastPrice;
  if (!currentPrice || currentPrice <= 0) return;   // ← no price → skip
```

- **Orders** come from `storage.getIbkrOrdersBySignal(signal.id)` (IBKR orders linked to this signal).
- **Filled entry** = one order with `status === "filled"` and `orderType === "market"`.
- **Current price** used for targets/stop is **`filledEntry.lastPrice`** (updated by IBKR sync from the broker), not a live quote API.

So a signal is **actually tracked** (targets/stop evaluated) only when:

- `signal.status === "active"`, and  
- There is at least one filled market order for that signal, and  
- That order has a valid `lastPrice`.

---

## 5. In-memory “already hit” set

**File:** `server/services/trade-monitor.ts` (145–148)

For each signal we keep a **Set** of keys we have already processed (target keys and optionally `"stop_loss"`). This prevents duplicate Discord alerts and duplicate DB updates within the same process:

```ts
  const signalHits = hitTargets.get(signal.id) || new Set<string>();
  hitTargets.set(signal.id, signalHits);
```

- **First time** we see this signal id → new `Set()`, then we store it in `hitTargets`.
- **Later cycles** → we reuse the same set, so e.g. `signalHits.has("tp1")` is true after we’ve already processed tp1.

---

## 6. Target hit logic (with code)

**File:** `server/services/trade-monitor.ts` (154–204)

Targets are parsed from **`data.targets`** (e.g. `tp1`, `tp2`) with price, take-off %, and optional raise-stop. Then we loop and only process targets **not** in `signalHits`:

```ts
  for (const target of targets) {
    if (signalHits.has(target.key)) continue;   // ← already processed

    const targetHit = bullish
      ? currentPrice >= target.price
      : currentPrice <= target.price;

    if (targetHit) {
      signalHits.add(target.key);   // ← mark so we don’t fire again

      // Optional: raise stop loss in data and persist
      if (target.raiseStopLoss) {
        const updatedData = { ...data };
        updatedData.stop_loss = target.raiseStopLoss;
        await storage.updateSignal(signal.id, { data: updatedData });
      }

      // Persist hit in signal data (for UI / history)
      const updatedData = { ...(signal.data as Record<string, any>) };
      if (!updatedData.hit_targets) updatedData.hit_targets = {};
      updatedData.hit_targets[target.key] = {
        hitAt: new Date().toISOString(),
        price: currentPrice,
      };
      await storage.updateSignal(signal.id, { data: updatedData });

      await sendTargetHitDiscordAlert(...);
      storage.createActivity({ type: "target_hit", ... }).catch(() => {});
    }
  }
```

- **Bullish** (Long/Call): target “hit” when **currentPrice >= target.price**.
- **Bearish** (Short/Put): target “hit” when **currentPrice <= target.price**.
- On hit we: update in-memory set, optionally raise stop in `data` and persist, persist `hit_targets`, send Discord, create activity.

---

## 7. Stop loss logic (with code)

**File:** `server/services/trade-monitor.ts` (205–236)

Stop loss is read from **`data.stop_loss`**. We only treat it as hit if we haven’t already recorded `"stop_loss"` in `signalHits`:

```ts
  if (stopLoss) {
    const slHit = bullish
      ? currentPrice <= stopLoss
      : currentPrice >= stopLoss;

    if (slHit && !signalHits.has("stop_loss")) {
      signalHits.add("stop_loss");

      await storage.updateSignal(signal.id, { status: "stopped_out" });   // ← no longer active
      hitTargets.delete(signal.id);   // ← remove from in-memory map

      await sendStopLossHitDiscord(...);
      storage.createActivity({ type: "stop_loss_hit", ... }).catch(() => {});
    }
  }
```

- **Bullish:** stop hit when **currentPrice <= stopLoss**.
- **Bearish:** stop hit when **currentPrice >= stopLoss**.
- After stop hit we set **`status` to `"stopped_out"`** so the signal is **no longer** in the active set on the next cycle, and we delete its entry from **`hitTargets`**.

---

## 8. All targets hit → mark completed

**File:** `server/services/trade-monitor.ts` (238–254)

After the target loop, we check if every target key is in `signalHits`. If so, we mark the signal **completed** and stop tracking it:

```ts
  const allTargetsHit = targets.length > 0 && targets.every((t) => signalHits.has(t.key));
  if (allTargetsHit) {
    await storage.updateSignal(signal.id, { status: "completed" });
    hitTargets.delete(signal.id);

    storage.createActivity({
      type: "signal_completed",
      title: `All targets hit for ${ticker}`,
      ...
    }).catch(() => {});
  }
```

So **tracking stops** when:

- **Stop loss hit** → `status = "stopped_out"`, `hitTargets.delete(signal.id)`.
- **All targets hit** → `status = "completed"`, `hitTargets.delete(signal.id)`.

---

## 9. Helpers: targets and direction

**File:** `server/services/trade-monitor.ts` (79–96, 98–104)

- **Targets** are parsed from **`data.targets`** (e.g. `tp1`, `tp2`), sorted by price, with optional **`raise_stop_loss.price`** per target:

```ts
function parseTargets(data: Record<string, any>): TargetInfo[] {
  if (!data.targets || typeof data.targets !== "object") return [];
  return Object.entries(data.targets)
    .filter(([, val]) => (val as any)?.price)
    .map(([key, val]) => {
      const t = val as any;
      return {
        key,
        price: Number(t.price),
        takeOffPercent: Number(t.take_off_percent) || 100,
        raiseStopLoss: t.raise_stop_loss?.price ? Number(t.raise_stop_loss.price) : undefined,
      };
    })
    .sort((a, b) => a.price - b.price);
}
```

- **Bullish** is used to decide direction of comparisons (target hit: price above/below; stop hit: price below/above):

```ts
function isBullishTrade(data: Record<string, any>): boolean {
  const instrumentType = data.instrument_type || "Shares";
  if (instrumentType === "Options") {
    return data.direction === "Call";
  }
  return data.direction === "Long" || data.direction !== "Short";
}
```

---

## 10. End-to-end flow summary

| Step | Code location | What happens |
|------|----------------|---------------|
| 1 | `signals.status` in DB | Only rows with `status === "active"` are considered. |
| 2 | `server/index.ts` | `startTradeMonitor()` runs `checkActiveTrades` every 10s. |
| 3 | `checkActiveTrades()` | `storage.getSignals()` → filter `s.status === "active"` → for each, `checkSignalTargets(signal)`. |
| 4 | `checkSignalTargets()` | Load orders for signal; require **filled market entry** and **valid lastPrice**; else skip. |
| 5 | Same | Get or create **signalHits** = `hitTargets.get(signal.id)` (Set of already-hit keys). |
| 6 | Same | For each target: if `signalHits.has(target.key)` skip; else if price condition hit → add to set, persist `data.hit_targets` and optional `data.stop_loss`, Discord, activity. |
| 7 | Same | If `data.stop_loss` set and price condition hit and `!signalHits.has("stop_loss")` → set status `stopped_out`, delete from hitTargets, Discord, activity. |
| 8 | Same | If all targets in signalHits → set status `completed`, delete from hitTargets, activity. |

So **“how we track the active signal”** in code is: **filter by `status === "active"`**, then for each such signal **with a filled entry and lastPrice** we run the target/stop logic once per 10s, using an **in-memory Set** to avoid duplicate hits and **DB status** (`stopped_out` / `completed`) to stop tracking.

---

## 11. Caveat: in-memory state and restarts

**`hitTargets`** is **not** restored from the database on startup. So:

- **Persisted:** `signal.data.hit_targets` (which targets were hit) and `signal.status` (`active` | `completed` | `stopped_out`).
- **Not persisted:** The Set inside `hitTargets` for each signal.

After a **server restart**, `hitTargets` is empty. The code does **not** rehydrate this Set from `data.hit_targets`. So for a signal that is still `active` and had e.g. tp1 already hit (only in `data.hit_targets`), the first run after restart could see `signalHits.has("tp1") === false` and, if `lastPrice` is still >= tp1 price, could trigger the target-hit logic again (Discord, activity) until we add rehydration from `data.hit_targets` into `signalHits` at the start of `checkSignalTargets`.
