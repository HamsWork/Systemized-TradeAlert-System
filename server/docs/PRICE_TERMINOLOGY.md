# Price terminology (project-wide)

We consistently distinguish two price concepts:

- **Tracking price** (`currentTrackingPrice` / `current_tracking_price`): The price used to compare against targets and stop loss. When the plan is **underlying-price-based** (e.g. options/LETF tracked by stock price), this is the **underlying** price (e.g. stock). When the plan is **instrument-price-based**, this is the **instrument** price (option premium, LETF share price, or stock for shares). Target hit and stop loss hit decisions use this price.

- **Instrument price** (`currentInstrumentPrice` / `current_instrument_price`): The actual traded instrument’s price (option premium, LETF share price, or share price). Used for P&L display, profit %, and “Option Price” / “LETF Entry” in Discord. For shares, tracking price and instrument price are the same.

**Usage:**

- **Trade monitor:** Fetches both when `needsUnderlyingPrice` (tracking = underlying, instrument = option/LETF); when not, both are the same (instrument price).
- **Discord alerts:** Send functions take `currentTrackingPrice` and `currentInstrumentPrice` so embeds can show both where needed.
- **Routes / API:** Request body can send `currentTrackingPrice` / `current_tracking_price` and `currentInstrumentPrice` / `current_instrument_price` for manual or preview sends when the caller has both.
