/**
 * SignalEngine — the advisor decision pipeline (post-audit orchestration)
 *
 * Wires the previously-isolated Epic 3–6 services into ONE deterministic
 * decision flow, parameterized by an InvestorProfile. It runs, in order:
 *
 *   InputValidator → RegimeClassifier → MultiTimeframeAnalyzer → SignalScorer
 *   → DerivativesAnalyzer → OnChainAnalyzer → SentimentAnalyzer → MacroAnalyzer
 *   → ATRRiskCalculator → VolatilityScaledSizer → DrawdownCircuitBreaker
 *
 * and emits a single structured `EngineResult` with an action and, when
 * tradeable, a `trade_setup` (entry / stop / cascaded TPs / position size).
 *
 * Governing principles (audit §18–§21):
 *   - No single indicator triggers a trade; 2+ dimensions must support.
 *   - Confidence is evidence strength, NOT win probability.
 *   - INSUFFICIENT_DATA / NO_TRADE are first-class outcomes.
 *   - Every quantitative input is supplied by the caller (no network I/O,
 *     no invented data). Fetch layers are invoked by the caller, not here.
 */

import { SignalScorer } from '../services/signal-scorer';
import { ScoringInputs } from '../types/index';
import { RegimeClassifier, Regime, RegimeEnum } from '../services/RegimeClassifier';
import { MultiTimeframeAnalyzer, Candle, Timeframe } from '../services/MultiTimeframeAnalyzer';
import { DEFAULT_STRATEGY_WEIGHTS } from '../services/StrategyWeighter';
import { ATRBasedRiskCalculator, VolatilityRegime } from '../services/ATRRiskCalculator';
import { VolatilityScaledSizer } from '../services/VolatilityScaledSizer';
import { DrawdownCircuitBreaker } from '../services/DrawdownCircuitBreaker';
import { DerivativesAnalyzer, DerivativesInput } from '../services/DerivativesAnalyzer';
import { OnChainAnalyzer, OnChainInput } from '../services/OnChainAnalyzer';
import { SentimentAnalyzer, SentimentInput } from '../services/SentimentAnalyzer';
import { MacroAnalyzer, MacroInput } from '../services/MacroAnalyzer';
import { AdvisorConfig } from '../config/advisor-config';
import { SignalAction } from '../types/index';

/** OHLCV candles keyed by timeframe (subset actually supplied). */
export type TimeframeData = Partial<Record<Timeframe, Candle[]>>;

/** Everything the engine needs to produce one signal. */
export interface EngineInput {
  symbol: string;
  /** Scoring inputs for the multi-factor SignalScorer. */
  scoring: ScoringInputs;
  /** Multi-timeframe candles (1D is also used for regime detection). */
  timeframes?: TimeframeData;
  /** Derivatives positioning (optional; missing → neutral). */
  derivatives?: DerivativesInput;
  /** On-chain metrics (optional; missing → neutral/MISSING). */
  onchain?: OnChainInput;
  /** Sentiment (Fear & Greed) (optional). */
  sentiment?: SentimentInput;
  /** Macro (DXY/VIX/S&P/…) (optional). */
  macro?: MacroInput;
  /** Portfolio context for sizing + drawdown gating. */
  portfolio: {
    equity: number;
    current_risk_usd?: number;
    positions?: Array<{ symbol: string; size: number; priceSeries: number[] }>;
  };
  /** OHLCV candles (e.g. 1H) for ATR-based stop/TP. */
  candles: Candle[];
  /** The investor config (AdvisorConfig) that parameterizes every tunable. */
  config: AdvisorConfig;
}

/** The structured engine verdict. */
export interface EngineResult {
  symbol: string;
  action: SignalAction;
  confidence: number;
  /** Highest-severity reason the trade was blocked (when action is NO_TRADE/INSUFFICIENT_DATA). */
  block_reason?: string;
  /** Regime detection result (when available). */
  regime?: Regime;
  /** Multi-timeframe alignment result (when available). */
  alignment?: { score: number; higher_direction: string; penalty: number };
  /** Derivatives / on-chain / sentiment / macro verdicts. */
  derivatives_verdict?: string;
  onchain_verdict?: string;
  sentiment_role?: string;
  macro_environment?: string;
  /** Trade setup (present only when action is BUY/WEAK_BUY/SELL/WEAK_SELL). */
  trade_setup?: {
    entry_price: number;
    stop_loss: number;
    take_profits: Array<{ price: number; percent: number }>;
    risk_reward_ratio: number;
    position_size: number;
    position_size_pct: number;
  };
  /** Full audit trail for explainability. */
  evidence: string[];
}

/** Build a confidence-adjusted action from the scorer, applying macro + alignment penalties. */
function applyConfidencePenalties(
  scorerResult: { action: SignalAction; confidence: number },
  macroReduction: number,
  alignmentPenalty: number,
): { action: SignalAction; confidence: number } {
  let confidence = scorerResult.confidence;
  const totalPenalty = macroReduction + alignmentPenalty;
  if (totalPenalty > 0) {
    confidence = Math.max(0, Math.round(confidence * (1 - totalPenalty / 100)));
  }
  return { action: scorerResult.action, confidence };
}

/** Map a regime enum to the ATR calculator's volatility regime. */
function toVolatilityRegime(regime: Regime): VolatilityRegime {
  switch (regime.regime) {
    case 'HIGH_VOL':
    case 'LIQUIDITY_SHOCK':
      return 'HIGH_VOL';
    case 'LOW_VOL':
      return 'LOW_VOL';
    default:
      return 'NEUTRAL';
  }
}

export class SignalEngine {
  private scorer: SignalScorer;
  private regimeClassifier: RegimeClassifier;
  private mtfAnalyzer: MultiTimeframeAnalyzer;
  private derivativesAnalyzer: DerivativesAnalyzer;
  private onchainAnalyzer: OnChainAnalyzer;
  private sentimentAnalyzer: SentimentAnalyzer;
  private macroAnalyzer: MacroAnalyzer;

  constructor() {
    this.scorer = new SignalScorer();
    this.regimeClassifier = new RegimeClassifier();
    this.mtfAnalyzer = new MultiTimeframeAnalyzer();
    this.derivativesAnalyzer = new DerivativesAnalyzer();
    this.onchainAnalyzer = new OnChainAnalyzer();
    this.sentimentAnalyzer = new SentimentAnalyzer();
    this.macroAnalyzer = new MacroAnalyzer();
  }

  /** Run the full pipeline and return a structured verdict. */
  evaluate(input: EngineInput): EngineResult {
    const evidence: string[] = [];
    const { config } = input;

    // 1. Regime detection (1D candles when provided).
    let regime: Regime | undefined;
    if (input.timeframes && input.timeframes['1D'] && input.timeframes['1D']!.length >= 20) {
      regime = this.regimeClassifier.detectRegime(input.timeframes['1D']!);
      evidence.push(`regime: ${regime.regime} (conf ${regime.confidence})`);
    }

    // 2. Multi-timeframe alignment.
    let alignment;
    let alignmentPenalty = 0;
    if (input.timeframes) {
      alignment = this.mtfAnalyzer.analyze(input.timeframes);
      alignmentPenalty = alignment.confidence_penalty;
      evidence.push(
        `multi-TF: alignment ${alignment.alignment_score}%, higher ${alignment.higher_tf_direction}, penalty ${alignmentPenalty}%`,
      );
    }

    // 3. Multi-factor score.
    const scorerResult = this.scorer.score(input.scoring);

    // 3b. Strategy tuning gate: profile's per-strategy enablement + regime weights.
    //     If the current regime maps to a disabled strategy (and no enabled
    //     strategy applies), entry is vetoed. Otherwise the effective regime
    //     weight is recorded for explainability.
    const strategyGate = this.applyStrategyTuning(regime, config);
    if (strategyGate.vetoed) {
      const reason = strategyGate.reason ?? 'strategy gate vetoed';
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: 0,
        block_reason: reason,
        regime,
        evidence: [...evidence, reason],
      };
    }
    if (strategyGate.reason) {
      evidence.push(strategyGate.reason);
    }

    // 4. Macro verdict + confidence reduction.
    let macroReduction = 0;
    let macroEnvironment: string | undefined;
    if (input.macro) {
      const direction =
        scorerResult.action.includes('BUY') ? 'bullish'
        : scorerResult.action.includes('SELL') ? 'bearish'
        : 'neutral';
      const macroResult = this.macroAnalyzer.analyzeMacro(input.macro, direction);
      macroEnvironment = macroResult.macro_environment;
      macroReduction = macroResult.confidence_reduction;
      evidence.push(`macro: ${macroEnvironment} (${macroResult.verdict})`);
    }

    // 5. Derivatives verdict.
    let derivativesVerdict: string | undefined;
    if (input.derivatives) {
      derivativesVerdict = this.derivativesAnalyzer.analyzeDerivatives(input.derivatives).derivatives_verdict;
      evidence.push(`derivatives: ${derivativesVerdict}`);
    }

    // 6. On-chain verdict.
    let onchainVerdict: string | undefined;
    if (input.onchain) {
      const direction =
        scorerResult.action.includes('BUY') ? 'bullish'
        : scorerResult.action.includes('SELL') ? 'bearish'
        : 'neutral';
      onchainVerdict = this.onchainAnalyzer.analyzeOnChain(input.onchain, direction).onchain_verdict;
      evidence.push(`on-chain: ${onchainVerdict}`);
    }

    // 7. Sentiment role.
    let sentimentRole: string | undefined;
    if (input.sentiment) {
      const direction =
        scorerResult.action.includes('BUY') ? 'bullish'
        : scorerResult.action.includes('SELL') ? 'bearish'
        : 'neutral';
      sentimentRole = this.sentimentAnalyzer.analyzeSentiment(input.sentiment, direction).role;
      evidence.push(`sentiment: ${sentimentRole}`);
    }

    // Apply penalties to confidence.
    const penalized = applyConfidencePenalties(scorerResult, macroReduction, alignmentPenalty);

    // 8. Insufficient data gate (scorer-level).
    if (scorerResult.insufficient_data || scorerResult.action === 'INSUFFICIENT_DATA') {
      return {
        symbol: input.symbol,
        action: 'INSUFFICIENT_DATA',
        confidence: 0,
        block_reason: 'insufficient or stale data',
        regime,
        alignment: alignment
          ? { score: alignment.alignment_score, higher_direction: alignment.higher_tf_direction, penalty: alignment.confidence_penalty }
          : undefined,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 9. Profile confirmation gates.
    if (config.confirmation.require_multi_timeframe_alignment && alignment && alignment.confirmation_flag === false) {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: 'multi-timeframe alignment required by profile but not confirmed',
        regime,
        alignment: alignment ? { score: alignment.alignment_score, higher_direction: alignment.higher_tf_direction, penalty: alignment.confidence_penalty } : undefined,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }
    if (config.confirmation.require_derivatives_confirmation && derivativesVerdict === 'CONTRADICTION') {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: 'derivatives contradiction (required confirmation missing)',
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }
    if (config.confirmation.require_on_chain_confirmation && onchainVerdict === 'CONTRADICTION') {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: 'on-chain contradiction (required confirmation missing)',
        regime,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 10. Confidence threshold gate.
    if (penalized.confidence < config.min_confidence) {
      return {
        symbol: input.symbol,
        action: 'HOLD',
        confidence: penalized.confidence,
        block_reason: `confidence ${penalized.confidence} below profile minimum ${config.min_confidence}`,
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 11. Drawdown circuit breaker (execution gate only).
    const breaker = new DrawdownCircuitBreaker({ max_drawdown_pct: config.drawdown.max_drawdown_pct });
    const breakerResult = breaker.canEnter(input.portfolio.equity);
    if (breakerResult.breached) {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: breakerResult.message,
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 12. Only BUY/SELL-family actions proceed to risk sizing + trade setup.
    const tradeable =
      penalized.action === 'BUY' ||
      penalized.action === 'STRONG_BUY' ||
      penalized.action === 'WEAK_BUY' ||
      penalized.action === 'SELL' ||
      penalized.action === 'STRONG_SELL' ||
      penalized.action === 'WEAK_SELL';

    if (!tradeable) {
      return {
        symbol: input.symbol,
        action: penalized.action,
        confidence: penalized.confidence,
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 13. ATR stop/TP + risk/reward gate.
    const entryPrice = input.scoring.price ?? input.candles[input.candles.length - 1]?.close ?? 0;
    if (entryPrice <= 0 || input.candles.length < 15) {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: 'insufficient candles or invalid entry price for risk calculation',
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    const volRegime = regime ? toVolatilityRegime(regime) : 'NEUTRAL';
    const riskCalc = new ATRBasedRiskCalculator({
      // All stop multipliers come from config.risk (JSON-driven, no inline literals).
      neutral_multiplier: config.risk.stop_atr_multiplier,
      low_vol_multiplier: config.risk.low_vol_multiplier,
      high_vol_multiplier: config.risk.high_vol_multiplier,
      atr_period: config.risk.atr_period,
      tp1_atr_multiple: config.risk.tp1_atr_multiple,
      tp2_atr_multiple: config.risk.tp2_atr_multiple,
      tp1_allocation: config.risk.tp1_allocation,
      min_reward_risk_ratio: config.risk.min_reward_risk_ratio,
    });
    const riskResult = riskCalc.calculate(input.candles, entryPrice, volRegime);

    if (riskResult.verdict === 'INADEQUATE_RR') {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: `inadequate risk/reward: ${riskResult.rationale}`,
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 14. Volatility-scaled position sizing.
    const sizer = new VolatilityScaledSizer({
      max_position_pct: config.sizing.max_position_pct,
      max_portfolio_risk_pct: config.sizing.max_portfolio_risk_pct,
    });
    const sizeResult = sizer.size({
      candles: input.candles,
      entryPrice,
      portfolioValue: input.portfolio.equity,
      currentPortfolioRisk: input.portfolio.current_risk_usd ?? 0,
      positions: input.portfolio.positions,
    });

    if (sizeResult.action === 'NO_TRADE') {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: `position sizing rejected: ${sizeResult.rationale}`,
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 15. Emit tradeable result with full trade setup.
    evidence.push(`ATR stop ${riskResult.stop_price}, TP1 ${riskResult.tp_level1}, TP2 ${riskResult.tp_level2}, R:R ${riskResult.ratio}`);
    evidence.push(`size ${sizeResult.position_size} (${(sizeResult.size_pct_of_portfolio * 100).toFixed(2)}% of portfolio)`);

    return {
      symbol: input.symbol,
      action: penalized.action,
      confidence: penalized.confidence,
      regime,
      alignment: alignment
        ? { score: alignment.alignment_score, higher_direction: alignment.higher_tf_direction, penalty: alignment.confidence_penalty }
        : undefined,
      derivatives_verdict: derivativesVerdict,
      onchain_verdict: onchainVerdict,
      sentiment_role: sentimentRole,
      macro_environment: macroEnvironment,
      trade_setup: {
        entry_price: entryPrice,
        stop_loss: riskResult.stop_price,
        take_profits: [
          { price: riskResult.tp_level1, percent: 0.5 },
          { price: riskResult.tp_level2, percent: 0.5 },
        ],
        risk_reward_ratio: riskResult.ratio,
        position_size: sizeResult.position_size,
        position_size_pct: sizeResult.size_pct_of_portfolio,
      },
      evidence,
    };
  }

  /**
   * Apply the profile's per-strategy tuning to the current regime.
   *
   * Determines which strategies are enabled under the current regime and their
   * effective regime weights (from the profile's `strategy_tuning.regime_weights`
   * override, falling back to the StrategyWeighter default table). Vetoes entry
   * when the regime maps to zero enabled strategies.
   */
  private applyStrategyTuning(
    regime: Regime | undefined,
    config: AdvisorConfig,
  ): { vetoed: boolean; reason?: string } {
    const tuning = config.strategy_tuning;
    const swing = tuning.swing;
    const daytrade = tuning.daytrade;

    // Without a regime we cannot gate strategies — allow both (no veto).
    if (!regime) {
      return { vetoed: false };
    }

    // Build an effective weight table from the profile's regime-weight overrides.
    const effectiveWeights = {
      swing: { ...DEFAULT_STRATEGY_WEIGHTS.swing, ...swing.regime_weights },
      daytrade: { ...DEFAULT_STRATEGY_WEIGHTS.daytrade, ...daytrade.regime_weights },
    };

    // Compute the weight each enabled strategy would carry in this regime.
    const swingWeight = swing.enabled ? this.weighterWeight(effectiveWeights, 'swing', regime.regime) : 0;
    const daytradeWeight = daytrade.enabled ? this.weighterWeight(effectiveWeights, 'daytrade', regime.regime) : 0;

    // Veto when both strategies are disabled for this regime.
    if (swingWeight <= 0 && daytradeWeight <= 0) {
      return {
        vetoed: true,
        reason: `regime ${regime.regime}: no strategy enabled (swing ${swing.enabled ? swingWeight : 'disabled'}, daytrade ${daytrade.enabled ? daytradeWeight : 'disabled'})`,
      };
    }

    const dominant = swingWeight >= daytradeWeight ? 'swing' : 'daytrade';
    return {
      vetoed: false,
      reason: `strategy gate: regime ${regime.regime} → swing ${swingWeight.toFixed(2)}, daytrade ${daytradeWeight.toFixed(2)} (dominant: ${dominant})`,
    };
  }

  /** Read a strategy's configured regime weight (0 if unconfigured). */
  private weighterWeight(
    weights: { swing: Partial<Record<RegimeEnum, number>>; daytrade: Partial<Record<RegimeEnum, number>> },
    strategy: 'swing' | 'daytrade',
    regime: RegimeEnum,
  ): number {
    return weights[strategy][regime] ?? 0;
  }
}

export default SignalEngine;
