#!/bin/bash

echo "🔍 Verifying Candelacharts Odds X Setup..."
echo ""

# Check Bun
if command -v bun &> /dev/null; then
    echo "✅ Bun installed: $(bun --version)"
else
    echo "❌ Bun not found. Please install Bun first."
    exit 1
fi

# Check dependencies
if [ -d "node_modules" ]; then
    echo "✅ Dependencies installed"
else
    echo "❌ Dependencies not installed. Run: bun install"
    exit 1
fi

# Check .env file
if [ -f ".env" ]; then
    echo "✅ .env file exists"
    
    # Check for required variables
    if grep -q "KALSHI_API_KEY_ID" .env; then
        echo "✅ KALSHI_API_KEY_ID configured"
    else
        echo "⚠️  KALSHI_API_KEY_ID not found in .env"
    fi
    
    if grep -q "KALSHI_PRIVATE_KEY" .env; then
        echo "✅ KALSHI_PRIVATE_KEY configured"
    else
        echo "⚠️  KALSHI_PRIVATE_KEY not configured in .env"
    fi
else
    echo "❌ .env file not found. Copy .env.example to .env"
    exit 1
fi

# Check source files
echo ""
echo "📁 Source Files:"
echo "   Config: $([ -f "src/config/config.ts" ] && echo "✅" || echo "❌")"
echo "   Services: $([ -f "src/services/kalshi.ts" ] && echo "✅" || echo "❌")"
echo "   Strategy: $([ -f "src/strategies/strategy.ts" ] && echo "✅" || echo "❌")"
echo "   Order Executor: $([ -f "src/services/orderExecutor.ts" ] && echo "✅" || echo "❌")"
echo "   Utils: $([ -f "src/utils/kalshiMarkets.ts" ] && echo "✅" || echo "❌")"

# Check directories
echo ""
echo "📂 Directories:"
echo "   tickers/: $([ -d "tickers" ] && echo "✅" || echo "❌")"
echo "   keys/: $([ -d "keys" ] && echo "✅" || echo "❌")"

echo ""
echo "🎯 Next Steps:"
echo "   1. Update .env with your Kalshi API credentials"
echo "   2. Run: bun run test-compile.ts (to verify)"
echo "   3. Run: bun run strategy (to start the bot)"
echo ""
echo "✅ Setup verification complete!"
