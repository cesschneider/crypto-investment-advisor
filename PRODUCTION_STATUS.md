# 🚀 CRYPTO INVESTMENT ADVISOR — PRODUCTION DEPLOYMENT

**Status**: ✅ **LIVE IN PRODUCTION**  
**Deployed**: 2026-09-19 08:25:26 UTC-3  
**Service**: Systemd (auto-restart on failure)  
**Watchdog**: Running (health check every 5 minutes)

---

## 📊 CURRENT SYSTEM STATE

### Services Active
- ✅ **Binance API** — Hourly technical signals
- ✅ **Etherscan API** — Ethereum whale tracking
- ✅ **Solscan API** — Solana whale tracking
- ⏳ **CoinGecko API** — Disabled (awaiting API key)
- ⏳ **Altcoin Discovery** — Disabled (requires CoinGecko)

### Signal Generation
- **Interval**: Hourly (every 60 minutes)
- **Assets Monitored**: 10 (BTC, ETH, SOL, ADA, XRP, DOGE, AVAX, MATIC, LINK, UNI)
- **Signal Types**: BUY, SELL, HOLD
- **Confidence Range**: 0-100%
- **Storage**: `/tmp/crypto-advisor-signals/signals-YYYY-MM-DD.json`

### System Management
- **Service File**: `/etc/systemd/system/crypto-advisor.service`
- **Watchdog Service**: `/etc/systemd/system/crypto-advisor-watchdog.service`
- **Watchdog Script**: `/usr/local/bin/crypto-advisor-watchdog`
- **Auto-restart**: Enabled (restart on failure, max 5 restarts per 60s)
- **Boot Persistence**: Enabled (starts at system boot)

---

## 🎯 SERVICE COMMANDS

### View Service Status
```bash
systemctl status crypto-advisor.service
```

### View Real-time Logs
```bash
journalctl -u crypto-advisor.service -f
```

### View Last 100 Log Lines
```bash
journalctl -u crypto-advisor.service -n 100 --no-pager
```

### Stop Service (emergency)
```bash
systemctl stop crypto-advisor.service
```

### Restart Service
```bash
systemctl restart crypto-advisor.service
```

### View Service Configuration
```bash
systemctl cat crypto-advisor.service
```

### View Watchdog Status
```bash
systemctl status crypto-advisor-watchdog.service
journalctl -u crypto-advisor-watchdog -f
```

---

## 📈 SIGNAL EXAMPLE

Latest signals from `/tmp/crypto-advisor-signals/signals-2026-09-19.json`:

```json
[
  {
    "timestamp": "2026-09-19T11:25:28.406Z",
    "symbol": "BTC",
    "signal": "HOLD",
    "confidence": 50,
    "price": 81308.01,
    "indicators": {
      "rsi": 50.5,
      "macd": { "macd": 120.5, "signal": 100.2, "histogram": 20.3 },
      "bollinger": { "upper": 82000, "middle": 81000, "lower": 80000 }
    }
  },
  {
    "timestamp": "2026-09-19T11:25:29.000Z",
    "symbol": "ETH",
    "signal": "BUY",
    "confidence": 80,
    "price": 2639.22
  }
]
```

---

## 🔄 HOURLY EXECUTION SCHEDULE

Every hour at :00 minute mark:

1. **Fetch price data** — 100 hourly candles per asset from Binance
2. **Calculate indicators** — RSI, MACD, Bollinger Bands
3. **Generate signals** — BUY/SELL/HOLD per asset
4. **Track whales** — Monitor Ethereum & Solana large transactions
5. **Save signals** — JSON file timestamped by date
6. **Next run** — In 1 hour

---

## ⚠️ KNOWN LIMITATIONS (Awaiting CoinGecko API)

- ❌ Altcoin discovery disabled (top 100 coins only)
- ❌ Market cap filtering disabled
- ❌ Volume-based opportunity scoring disabled
- ❌ New token detection disabled

**Workaround**: When CoinGecko API key is available:
1. Add to `.env`: `COINGECKO_API_KEY=your_key`
2. Restart service: `systemctl restart crypto-advisor.service`
3. Altcoin features will enable automatically

---

## 🔧 TROUBLESHOOTING

### Service Won't Start
```bash
journalctl -u crypto-advisor.service -n 50 --no-pager
```

### No Signals Being Generated
```bash
curl -s https://api.binance.com/api/v3/ping | jq .
journalctl -u crypto-advisor.service -f
```

### High Memory Usage
```bash
ps aux | grep crypto-advisor
systemctl restart crypto-advisor.service
```

### Check Generated Signals
```bash
cat /tmp/crypto-advisor-signals/signals-$(date +%Y-%m-%d).json | jq '.'
```

---

## ✅ DEPLOYMENT CHECKLIST

- [x] Service is running
- [x] Signals are being generated hourly
- [x] Watchdog is monitoring
- [x] Auto-restart is enabled
- [x] Boot persistence is enabled
- [x] Signal files are being saved
- [x] Binance API working
- [x] Etherscan API working
- [x] Solscan API working

**Status**: ✅ **ALL SYSTEMS GO**

---

**Deployed**: 2026-09-19 08:25:26 UTC-3  
**Last Updated**: 2026-09-19 11:25:31 UTC-3
