# Automatic Position Cleanup

## Overview

The bot now automatically cleans up stale and closed positions from its internal tracking system. This prevents the accumulation of expired market data and ensures the position tracker stays current.

## How It Works

### Automatic Cleanup

The `autoCleanupPositions()` method runs automatically on every strategy cycle (every 1-5 seconds) and removes:

1. **Stale Positions**: Positions older than `AUTO_CLEAR_MINUTES` (default: 15 minutes)
2. **Closed Positions**: Positions with status "closed" (both sides sold)

### What Gets Cleaned

```typescript
// Example: Position is automatically removed if:
- Age > 15 minutes (configurable via AUTO_CLEAR_MINUTES)
- Status === "closed" (both YES and NO sides have been sold)
```

### What Doesn't Get Cleaned

- Active positions (status: "open")
- Partial positions (status: "partial" - one side closed)
- Recent positions (< AUTO_CLEAR_MINUTES old)

## Configuration

### Environment Variable

Set `AUTO_CLEAR_MINUTES` in your `.env` file:

```env
# Clear positions older than 15 minutes (default)
AUTO_CLEAR_MINUTES=15

# More aggressive cleanup (5 minutes)
AUTO_CLEAR_MINUTES=5

# Less aggressive cleanup (30 minutes)
AUTO_CLEAR_MINUTES=30
```

### When to Adjust

**Use shorter duration (5-10 minutes):**
- High-frequency trading (15-minute markets)
- Want to keep tracking data minimal
- Trading multiple assets simultaneously

**Use longer duration (30-60 minutes):**
- Lower-frequency trading (hourly markets)
- Want to keep position history longer
- Debugging or analysis purposes

## Manual Position Management

You can still manually manage positions using the `clear-positions.ts` script:

### View Current Positions

```bash
bun run scripts/clear-positions.ts
```

Output:
```
📊 Current Positions:
────────────────────────────────────────────────────────────────────────────────

Ticker: KXBTC15M-01FEB121500-00
  Strategy: Technical-Directional
  Status: open
  Sides: YES
  Total Cost: $0.4200
  Expected Profit: $0.5800
  Age: 15 minutes (900 seconds)
  Entry Time: 2/1/2026, 12:00:00 PM
────────────────────────────────────────────────────────────────────────────────
```

### Clear All Positions

```bash
bun run scripts/clear-positions.ts clear
```

### Clear Specific Position

```bash
bun run scripts/clear-positions.ts clear-ticker KXBTC15M-01FEB121500-00
```

## Benefits

### 1. Prevents Stale Data Accumulation
- Expired markets are automatically removed
- Position tracker stays current
- No manual cleanup needed

### 2. Handles Market Expiry
- Markets expire every 15 minutes or 1 hour
- Old positions are cleaned up automatically
- Prevents confusion about which positions are active

### 3. Improves Performance
- Smaller position map = faster lookups
- Less memory usage
- Cleaner logs and displays

### 4. Reduces Manual Maintenance
- No need to run `clear-positions.ts` regularly
- Bot maintains itself
- Focus on trading, not housekeeping

## Implementation Details

### Location

The auto-cleanup logic is in:
- `src/services/orderExecutor.ts` - `autoCleanupPositions()` method
- `src/services/strategyRunner.ts` - Called at start of each `run()` cycle

### Execution Flow

```
1. Strategy runner starts new cycle
2. Call autoCleanupPositions()
3. Check each position:
   - If age > AUTO_CLEAR_HOURS → Remove
   - If status === "closed" → Remove
4. Log cleanup results
5. Continue with strategy execution
```

### Console Output

When positions are cleaned:

```
🧹 Auto-cleared stale position: KXBTC15M-01FEB000000-00 (age: 16 minutes)
🧹 Auto-cleared closed position: KXBTC15M-01FEB010000-00
✓ Auto-cleanup complete: 1 stale, 1 closed positions removed
```

When no cleanup needed:
- No output (silent operation)

## Troubleshooting

### Position Not Being Cleaned

**Check the age:**
```bash
bun run scripts/clear-positions.ts
# Look at "Age" field
```

If age < AUTO_CLEAR_MINUTES, it won't be cleaned yet.

**Check the status:**
- "open" positions are NOT auto-cleaned (still active)
- "partial" positions are NOT auto-cleaned (one side still open)
- Only "closed" positions are auto-cleaned

### Manual Override

If you need to immediately clear a position:

```bash
# Clear specific position
bun run scripts/clear-positions.ts clear-ticker TICKER

# Clear all positions
bun run scripts/clear-positions.ts clear
```

## Best Practices

1. **Set AUTO_CLEAR_MINUTES based on your trading frequency:**
   - 15-minute markets: 15-30 minutes (matches market expiry)
   - Hourly markets: 60-120 minutes (matches market expiry)

2. **Monitor the cleanup logs:**
   - Check if positions are being cleaned regularly
   - Adjust AUTO_CLEAR_MINUTES if needed

3. **Use manual cleanup for immediate needs:**
   - Testing new strategies
   - Debugging position issues
   - Resetting after errors

4. **Don't set AUTO_CLEAR_MINUTES too low:**
   - Minimum recommended: 15 minutes (matches 15m market expiry)
   - Markets need time to expire and settle
   - Give positions time to complete naturally

## Related Documentation

- [Position Management](../README.md#position-management)
- [Clear Positions Script](../scripts/clear-positions.ts)
- [Configuration](../README.md#configuration)
