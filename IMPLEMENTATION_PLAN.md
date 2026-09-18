# CRYPTO INVESTMENT ADVISOR — PLANO DE IMPLEMENTAÇÃO

## 📋 Fases de Execução

### FASE 1: Configuração API (30 minutos) — BLOQUEADOR
**Status**: Aguardando suas chaves de API

#### Passos:
1. Você providencia 8 chaves de API:
   - [ ] CoinGecko (Pro recomendado)
   - [ ] Binance (2 chaves: API + Secret)
   - [ ] Etherscan
   - [ ] Solscan
   - [ ] 1inch
   - [ ] 0x (opcional)
   - [ ] DefiLlama (não requer chave)
   - [ ] Dune Analytics (opcional)

2. Eu configuro `.env`:
   ```bash
   cd /root/projects/crypto-investment-advisor
   cp .env.example .env
   # Paste your keys here
   ```

3. Teste básico:
   ```bash
   npm install
   npm run analyze  # First test
   ```

**Decisão necessária**: Qual é a prioridade de API?
- **MUST HAVE**: CoinGecko, Binance, Etherscan (top 100 coins + Ethereum)
- **NICE TO HAVE**: Solscan, 1inch (altcoin discovery)
- **OPTIONAL**: Dune, 0x (advanced queries)

---

### FASE 2: Implementar Scripts de Monitoramento (1-2 horas)

#### 2.1 - Script de Análise Top 100
**Arquivo**: `src/scripts/monitor-signals.ts`

```typescript
// Pseudocódigo do que será implementado:
1. Fetch top 100 coins from CoinGecko
2. For each coin:
   - Get 90-day OHLC from Binance
   - Calculate RSI, MACD, SMA
   - Identify support/resistance
   - Generate trading signal
3. Save signals to data/signals/latest.json
4. Log alerts for STRONG_BUY / STRONG_SELL
5. Send webhook if configured
```

**Output esperado**:
```json
{
  "timestamp": "2026-09-18T07:50:00Z",
  "signals": [
    {
      "symbol": "BTC",
      "price": 36500,
      "rsi": 28,
      "signal": "STRONG_BUY",
      "confidence": 85,
      "reasons": ["Oversold (RSI < 30) with bullish MACD"]
    }
  ]
}
```

#### 2.2 - Script de Descoberta de Altcoins
**Arquivo**: `src/scripts/scan-launches.ts`

```typescript
// Pseudocódigo:
1. Query DEX aggregators (1inch, 0x) for new pools
2. Get contract data from Etherscan
3. Analyze token holders, supply, lock duration
4. Score each altcoin (0-100)
5. Filter by:
   - Age: < 30 days
   - Liquidity: $100K-$10M
   - Holders: < 70% concentration
6. Rank by score and save
```

**Output esperado**:
```json
{
  "timestamp": "2026-09-18T07:50:00Z",
  "altcoins": [
    {
      "symbol": "NEW",
      "name": "New Token",
      "age_days": 18,
      "score": 78,
      "recommendation": "BUY",
      "liquidity_usd": 450000,
      "red_flags": []
    }
  ]
}
```

#### 2.3 - Script de Geração de Relatório Diário
**Arquivo**: `src/scripts/generate-report.ts`

```typescript
// Pseudocódigo:
1. Read signals from data/signals/
2. Read altcoins from data/opportunities/
3. Compile top 5 BUY opportunities
4. Compile top 10 altcoins ranked
5. Identify whale movements
6. Generate markdown report
7. Send via email/webhook/WhatsApp
```

---

### FASE 3: Integração com Hermes (1-2 horas)

#### 3.1 - Cron Job para Monitoramento Hourly
```bash
# Command:
mcp__cronjob create \
  --schedule "0 * * * *" \
  --prompt "Run crypto investment analysis: npm run analyze" \
  --deliver "origin" \
  --notify true
```

**Resultado**: WhatsApp alert a cada hora com os melhores signals

#### 3.2 - Cron Job para Relatório Diário
```bash
mcp__cronjob create \
  --schedule "0 7 * * *" \
  --prompt "Generate daily crypto investment report at 7 AM" \
  --deliver "origin" \
  --notify true
```

**Resultado**: Briefing diário às 7 AM com top opportunities

#### 3.3 - Cron Job para Scan de Altcoins
```bash
mcp__cronjob create \
  --schedule "0 6,10,14,18,22 * * *" \
  --prompt "Scan for new altcoin launches every 4 hours" \
  --deliver "origin" \
  --notify true
```

**Resultado**: Alert quando novo altcoin promissor é detectado

---

### FASE 4: Dashboard & Visualização (2-3 horas)

#### 4.1 - Criar Dashboard Web Simples
**Tecnologia**: HTML + Chart.js (Lovable ou manual)

**Funcionalidades**:
- [ ] Gráfico de RSI/MACD dos top 5 coins
- [ ] Tabela de altcoins ranked 0-100
- [ ] Timeline de whale movements
- [ ] Lista de alertas em tempo real
- [ ] Histórico de trades sugeridos

#### 4.2 - Integração com Sistema de Alertas
- [ ] Webhook para Discord
- [ ] Email notifications
- [ ] WhatsApp via Hermes
- [ ] Telegram (opcional)

---

### FASE 5: Backtesting & Otimização (3-5 horas)

#### 5.1 - Implementar Backtesting
```typescript
// Usar dados históricos de Binance
1. Load 180 days of OHLCV data
2. Simulate all signals generated
3. Calculate win rate, avg gain, max loss
4. Generate backtest report
```

**Output**: Win rate %, Sharpe ratio, max drawdown

#### 5.2 - Otimizar Thresholds
- Ajustar RSI levels (30 vs 35?)
- Ajustar MACD sensitivity
- Ajustar minutos de volume (500K vs 250K?)

**Decisão**: Qual é o target de win rate?
- Conservative: 55-60%
- Aggressive: 60-70%
- Very aggressive: 70%+ (alto risco)

---

### FASE 6: Produção & Monitoramento (1-2 horas)

#### 6.1 - Deploy em Produção
```bash
# Option A: Systemd service (runs forever)
sudo systemctl start crypto-monitor
sudo systemctl enable crypto-monitor

# Option B: Screen session (manual)
screen -S crypto-monitor
npm run monitor

# Option C: Hermes cron (recommended for you)
# Already set up in Phase 3
```

#### 6.2 - Monitoramento & Logging
- [ ] Configurar log rotation (`/var/log/crypto-advisor.log`)
- [ ] Set up alertas para erros
- [ ] Monitor performance (API rate limits, response times)

#### 6.3 - Manutenção Regular
- [ ] Review performance weekly
- [ ] Adjust thresholds if needed
- [ ] Monitor API rate limits
- [ ] Update config for market conditions

---

## 🗺️ Timeline Estimado

| Fase | Duração | Bloqueador | Status |
|------|---------|-----------|--------|
| 1. Setup APIs | 30 min | Suas chaves | ⏳ Aguardando |
| 2. Scripts | 1-2 horas | APIs configuradas | ⏳ Pronto para começar |
| 3. Hermes/Cron | 1-2 horas | Scripts prontos | ✅ Pronto |
| 4. Dashboard | 2-3 horas | Scripts prontos | ⏳ Pós-MVP |
| 5. Backtesting | 3-5 horas | Scripts prontos | ⏳ Pós-MVP |
| 6. Produção | 1-2 horas | Tudo pronto | ✅ Pronto |
| **TOTAL** | **8-15 horas** | **Suas APIs** | ⏳ Bloqueado |

---

## 🎯 Primeira Ação (Pode Começar Agora!)

Mesmo sem APIs, posso:

1. ✅ Implementar tests com dados mock
2. ✅ Validar lógica dos analyzers
3. ✅ Criar estrutura de dados
4. ✅ Preparar schema de output
5. ✅ Build cron job templates

**Você quer que eu comece com tests/mocks enquanto espera pelas chaves?**

---

## 📊 Decisões Necessárias

Antes de começar Fase 2, confirme:

1. **APIs**: Qual é a prioridade de API para começar?
   - [ ] Apenas CoinGecko + Binance (análise básica)
   - [ ] + Etherscan (on-chain data)
   - [ ] + 1inch (altcoin discovery)
   - [ ] Todas as 8

2. **Estratégia**: Qual é seu alvo?
   - [ ] Swing trading (7-60 dias)
   - [ ] Momentum trading (horas-dias)
   - [ ] Altcoin hunting (longo prazo)
   - [ ] Todas as 3 estratégias

3. **Risco**: Qual é sua tolerância?
   - [ ] Conservative (55-60% win rate, stops rigorosos)
   - [ ] Moderate (60-70% win rate)
   - [ ] Aggressive (70%+ win rate, maior risco)

4. **Alertas**: Como prefere receber?
   - [ ] WhatsApp (Hermes)
   - [ ] Email
   - [ ] Discord webhook
   - [ ] Dashboard web
   - [ ] Todos

5. **Frequência**: Qual é a cadência ideal?
   - [ ] Hourly (top 100)
   - [ ] 4-hourly (altcoins)
   - [ ] Daily (briefing)
   - [ ] Real-time (24/7)

---

## 📝 Checklist para Começar

- [ ] Você providencia 8 chaves de API
- [ ] Confirma decisões acima (5 pontos)
- [ ] Eu implemento Fases 2-3 (scripts + cron)
- [ ] Testamos com dados reais
- [ ] Você faz ajustes de thresholds
- [ ] Deploy em produção
- [ ] Backtesting & otimização
- [ ] Sistema 24/7 gerando oportunidades

---

**Próximo passo**: Você providencia as chaves de API? Ou prefere que eu comece com implementation de testes/mocks enquanto isso?
