import {
  ScoringInputs,
  ScoringResult,
  SignalAction,
  DimensionScore,
  confidenceToStrength
} from '../types/index';

/**
 * Multi-Factor Signal Scorer (Epic 3, Story 3.1)
 * 
 * Scores trading signals across 8+ dimensions:
 * 1. Trend (1D+) — uptrend/downtrend/sideways
 * 2. Momentum (4H/1H) — RSI, MACD
 * 3. Structure — support/resistance levels
 * 4. Volume — trading volume trends
 * 5. Derivatives — funding rates, open interest
 * 6. On-chain — whale activity, holder concentration
 * 7. Macro — risk-on/off regime
 * 8. Sentiment — social/news signals
 * 
 * Confidence (0-100) represents EVIDENCE STRENGTH, not win probability.
 * No single indicator alone can trigger BUY/SELL without 2+ supporting dimensions.
 * INSUFFICIENT_DATA and NO_TRADE are first-class outcomes.
 */

export class SignalScorer {
  /**
   * Score a potential trade signal across multiple dimensions.
   * 
   * @param inputs Scoring inputs with optional dimension data
   * @returns ScoringResult with action, confidence, and audit trail
   */
  score(inputs: ScoringInputs): ScoringResult {
    const timestamp = new Date().toISOString();
    const dimensions: DimensionScore[] = [];
    const trace: { [key: string]: { score: number; evidence: string } } = {};

    // Score each dimension
    const trendScore = this.scoreTrend(inputs);
    dimensions.push(trendScore);
    trace[trendScore.dimension] = { score: trendScore.score, evidence: trendScore.evidence };

    const momentumScore = this.scoreMomentum(inputs);
    dimensions.push(momentumScore);
    trace[momentumScore.dimension] = { score: momentumScore.score, evidence: momentumScore.evidence };

    const structureScore = this.scoreStructure(inputs);
    dimensions.push(structureScore);
    trace[structureScore.dimension] = { score: structureScore.score, evidence: structureScore.evidence };

    const volumeScore = this.scoreVolume(inputs);
    dimensions.push(volumeScore);
    trace[volumeScore.dimension] = { score: volumeScore.score, evidence: volumeScore.evidence };

    const derivativesScore = this.scoreDerivatives(inputs);
    dimensions.push(derivativesScore);
    trace[derivativesScore.dimension] = { score: derivativesScore.score, evidence: derivativesScore.evidence };

    const onchainScore = this.scoreOnchain(inputs);
    dimensions.push(onchainScore);
    trace[onchainScore.dimension] = { score: onchainScore.score, evidence: onchainScore.evidence };

    const macroScore = this.scoreMacro(inputs);
    dimensions.push(macroScore);
    trace[macroScore.dimension] = { score: macroScore.score, evidence: macroScore.evidence };

    const sentimentScore = this.scoreSentiment(inputs);
    dimensions.push(sentimentScore);
    trace[sentimentScore.dimension] = { score: sentimentScore.score, evidence: sentimentScore.evidence };

    // Check for data freshness issues
    const freshnessIssues = this.checkDataFreshness(inputs);
    const hasStaleData = freshnessIssues.length > 0;

    // Compute final score and determine action
    const result = this.computeAction(dimensions, hasStaleData, inputs.symbol, timestamp);

    return {
      symbol: inputs.symbol,
      timestamp,
      action: result.action,
      confidence: result.confidence,
      strength: confidenceToStrength(result.confidence),
      score: result.score,
      dimensions,
      trace,
      supporting_dimensions_count: result.supporting_dimensions_count,
      data_freshness_issues: freshnessIssues.length > 0 ? freshnessIssues : undefined,
      insufficient_data: result.insufficient_data
    };
  }

  /**
   * Trend dimension (1D+): Is price in uptrend, downtrend, or sideways?
   */
  private scoreTrend(inputs: ScoringInputs): DimensionScore {
    if (!inputs.trend || inputs.trend_strength === undefined) {
      return {
        dimension: 'trend',
        score: 50,
        evidence: 'Trend data not provided',
        contributing: false
      };
    }

    let score = 50; // neutral baseline
    let evidence = '';

    if (inputs.trend === 'UPTREND') {
      score = 50 + (inputs.trend_strength ?? 0);
      evidence = `Uptrend detected (strength: ${inputs.trend_strength}%)`;
    } else if (inputs.trend === 'DOWNTREND') {
      score = 50 - (inputs.trend_strength ?? 0);
      evidence = `Downtrend detected (strength: ${inputs.trend_strength}%)`;
    } else {
      evidence = 'Sideways trend; neutral signal';
    }

    score = Math.max(0, Math.min(100, score));
    return {
      dimension: 'trend',
      score,
      evidence,
      contributing: true
    };
  }

  /**
   * Momentum dimension (4H/1H): RSI and MACD signals.
   */
  private scoreMomentum(inputs: ScoringInputs): DimensionScore {
    let score = 50;
    const evidenceList: string[] = [];

    if (inputs.rsi_14 !== undefined) {
      if (inputs.rsi_14 < 30) {
        score -= 20; // oversold
        evidenceList.push(`RSI ${inputs.rsi_14.toFixed(1)} (oversold)`);
      } else if (inputs.rsi_14 > 70) {
        score += 20; // overbought
        evidenceList.push(`RSI ${inputs.rsi_14.toFixed(1)} (overbought)`);
      } else {
        evidenceList.push(`RSI ${inputs.rsi_14.toFixed(1)} (neutral)`);
      }
    }

    if (inputs.macd_histogram !== undefined) {
      if (inputs.macd_histogram > 0) {
        score += 10; // bullish
        evidenceList.push(`MACD bullish (+${inputs.macd_histogram.toFixed(4)})`);
      } else if (inputs.macd_histogram < 0) {
        score -= 10; // bearish
        evidenceList.push(`MACD bearish (${inputs.macd_histogram.toFixed(4)})`);
      } else {
        evidenceList.push('MACD neutral');
      }
    }

    if (evidenceList.length === 0) {
      return {
        dimension: 'momentum',
        score: 50,
        evidence: 'Momentum data not provided',
        contributing: false
      };
    }

    score = Math.max(0, Math.min(100, score));
    return {
      dimension: 'momentum',
      score,
      evidence: evidenceList.join('; '),
      contributing: true
    };
  }

  /**
   * Structure dimension: Support/resistance levels and price position.
   */
  private scoreStructure(inputs: ScoringInputs): DimensionScore {
    if (!inputs.price || (!inputs.supports && !inputs.resistances)) {
      return {
        dimension: 'structure',
        score: 50,
        evidence: 'Support/resistance data not provided',
        contributing: false
      };
    }

    let score = 50;
    const evidenceList: string[] = [];

    // Check proximity to supports
    if (inputs.supports && inputs.supports.length > 0) {
      const nearestSupport = inputs.supports.sort((a, b) => b - a)[0];
      if (inputs.price > nearestSupport && inputs.price - nearestSupport < (inputs.price * 0.02)) {
        score += 15;
        evidenceList.push(`Near support at ${nearestSupport.toFixed(2)}`);
      } else if (inputs.price > nearestSupport) {
        evidenceList.push(`Above support at ${nearestSupport.toFixed(2)}`);
      }
    }

    // Check proximity to resistances
    if (inputs.resistances && inputs.resistances.length > 0) {
      const nearestResistance = inputs.resistances.sort((a, b) => a - b)[0];
      if (inputs.price < nearestResistance && nearestResistance - inputs.price < (inputs.price * 0.02)) {
        score -= 15;
        evidenceList.push(`Near resistance at ${nearestResistance.toFixed(2)}`);
      } else if (inputs.price < nearestResistance) {
        evidenceList.push(`Below resistance at ${nearestResistance.toFixed(2)}`);
      }
    }

    if (evidenceList.length === 0) {
      evidenceList.push('Price in neutral zone relative to structure');
    }

    score = Math.max(0, Math.min(100, score));
    return {
      dimension: 'structure',
      score,
      evidence: evidenceList.join('; '),
      contributing: true
    };
  }

  /**
   * Volume dimension: Trading volume trends.
   */
  private scoreVolume(inputs: ScoringInputs): DimensionScore {
    if (!inputs.volume_24h && !inputs.volume_7d && !inputs.volume_avg_30d) {
      return {
        dimension: 'volume',
        score: 50,
        evidence: 'Volume data not provided',
        contributing: false
      };
    }

    let score = 50;
    const evidenceList: string[] = [];

    // Compare 24h to 7d average
    if (inputs.volume_24h && inputs.volume_7d) {
      const ratio = inputs.volume_24h / (inputs.volume_7d / 7);
      if (ratio > 1.5) {
        score += 15;
        evidenceList.push(`High volume: 24h ${(ratio * 100).toFixed(0)}% of 7d average`);
      } else if (ratio < 0.7) {
        score -= 10;
        evidenceList.push(`Low volume: 24h ${(ratio * 100).toFixed(0)}% of 7d average`);
      }
    }

    // Compare 7d to 30d average
    if (inputs.volume_7d && inputs.volume_avg_30d) {
      const ratio = inputs.volume_7d / (inputs.volume_avg_30d * 7);
      if (ratio > 1.3) {
        score += 10;
        evidenceList.push(`Volume surge: 7d trend positive`);
      }
    }

    if (evidenceList.length === 0) {
      evidenceList.push('Volume trends neutral');
    }

    score = Math.max(0, Math.min(100, score));
    return {
      dimension: 'volume',
      score,
      evidence: evidenceList.join('; '),
      contributing: true
    };
  }

  /**
   * Derivatives dimension: Funding rates, open interest.
   */
  private scoreDerivatives(inputs: ScoringInputs): DimensionScore {
    if (inputs.funding_rate === undefined && inputs.open_interest_change === undefined) {
      return {
        dimension: 'derivatives',
        score: 50,
        evidence: 'Derivatives data not provided',
        contributing: false
      };
    }

    let score = 50;
    const evidenceList: string[] = [];

    // Funding rate analysis
    if (inputs.funding_rate !== undefined) {
      if (inputs.funding_rate > 0.001) {
        score -= 20; // high positive funding = too many longs
        evidenceList.push(`High positive funding (${(inputs.funding_rate * 100).toFixed(3)}%) — bearish`);
      } else if (inputs.funding_rate < -0.001) {
        score += 10; // negative funding = shorts squeezed
        evidenceList.push(`Negative funding (${(inputs.funding_rate * 100).toFixed(3)}%) — bullish`);
      } else {
        evidenceList.push(`Neutral funding (${(inputs.funding_rate * 100).toFixed(3)}%)`);
      }
    }

    // Open interest analysis
    if (inputs.open_interest_change !== undefined) {
      if (inputs.open_interest_change > 20) {
        score += 15;
        evidenceList.push(`OI surge (+${inputs.open_interest_change.toFixed(1)}%) — conviction increasing`);
      } else if (inputs.open_interest_change < -20) {
        score -= 15;
        evidenceList.push(`OI decline (${inputs.open_interest_change.toFixed(1)}%) — conviction declining`);
      }
    }

    if (evidenceList.length === 0) {
      evidenceList.push('Derivatives positioning neutral');
    }

    score = Math.max(0, Math.min(100, score));
    return {
      dimension: 'derivatives',
      score,
      evidence: evidenceList.join('; '),
      contributing: true
    };
  }

  /**
   * On-chain dimension: Whale activity, holder concentration.
   */
  private scoreOnchain(inputs: ScoringInputs): DimensionScore {
    if (inputs.whale_accumulation === undefined && inputs.holder_concentration === undefined) {
      return {
        dimension: 'onchain',
        score: 50,
        evidence: 'On-chain data not provided',
        contributing: false
      };
    }

    let score = 50;
    const evidenceList: string[] = [];

    // Whale accumulation
    if (inputs.whale_accumulation !== undefined) {
      if (inputs.whale_accumulation > 30) {
        score += 20;
        evidenceList.push(`Strong whale accumulation (${inputs.whale_accumulation.toFixed(0)}) — bullish`);
      } else if (inputs.whale_accumulation < -30) {
        score -= 20;
        evidenceList.push(`Whale distribution (${inputs.whale_accumulation.toFixed(0)}) — bearish`);
      } else {
        evidenceList.push(`Whale activity neutral (${inputs.whale_accumulation.toFixed(0)})`);
      }
    }

    // Holder concentration (lower = healthier)
    if (inputs.holder_concentration !== undefined) {
      if (inputs.holder_concentration < 30) {
        score += 10;
        evidenceList.push(`Healthy holder distribution (${inputs.holder_concentration.toFixed(0)}%)`);
      } else if (inputs.holder_concentration > 60) {
        score -= 10;
        evidenceList.push(`High concentration (${inputs.holder_concentration.toFixed(0)}%) — whale risk`);
      }
    }

    if (evidenceList.length === 0) {
      evidenceList.push('On-chain metrics neutral');
    }

    score = Math.max(0, Math.min(100, score));
    return {
      dimension: 'onchain',
      score,
      evidence: evidenceList.join('; '),
      contributing: true
    };
  }

  /**
   * Macro dimension: Risk-on/off regime.
   */
  private scoreMacro(inputs: ScoringInputs): DimensionScore {
    if (!inputs.macro_regime && inputs.macro_strength === undefined) {
      return {
        dimension: 'macro',
        score: 50,
        evidence: 'Macro data not provided',
        contributing: false
      };
    }

    let score = 50;
    let evidence = '';

    if (inputs.macro_regime === 'RISK_ON') {
      score = 50 + (inputs.macro_strength ?? 25);
      evidence = `Risk-on regime (strength: ${inputs.macro_strength ?? 25}%)`;
    } else if (inputs.macro_regime === 'RISK_OFF') {
      score = 50 - (inputs.macro_strength ?? 25);
      evidence = `Risk-off regime (strength: ${inputs.macro_strength ?? 25}%)`;
    } else {
      evidence = 'Macro regime neutral';
    }

    score = Math.max(0, Math.min(100, score));
    return {
      dimension: 'macro',
      score,
      evidence,
      contributing: true
    };
  }

  /**
   * Sentiment dimension: Social, news, etc.
   */
  private scoreSentiment(inputs: ScoringInputs): DimensionScore {
    if (inputs.sentiment_score === undefined) {
      return {
        dimension: 'sentiment',
        score: 50,
        evidence: 'Sentiment data not provided',
        contributing: false
      };
    }

    // Map -100..100 to 0..100
    const score = 50 + (inputs.sentiment_score / 2);
    let sentiment = '';

    if (inputs.sentiment_score > 50) {
      sentiment = 'Very bullish';
    } else if (inputs.sentiment_score > 20) {
      sentiment = 'Bullish';
    } else if (inputs.sentiment_score < -50) {
      sentiment = 'Very bearish';
    } else if (inputs.sentiment_score < -20) {
      sentiment = 'Bearish';
    } else {
      sentiment = 'Neutral';
    }

    const evidence = `Sentiment ${sentiment} (score: ${inputs.sentiment_score.toFixed(0)}/100)`;
    return {
      dimension: 'sentiment',
      score: Math.max(0, Math.min(100, score)),
      evidence,
      contributing: true
    };
  }

  /**
   * Check for stale or missing critical data.
   */
  private checkDataFreshness(inputs: ScoringInputs): string[] {
    const issues: string[] = [];
    const MAX_AGE_SECONDS = 3600; // 1 hour

    if (!inputs.data_age_seconds) {
      return issues;
    }

    for (const [dimension, ageSeconds] of Object.entries(inputs.data_age_seconds)) {
      if (ageSeconds > MAX_AGE_SECONDS) {
        issues.push(`${dimension} data stale (${ageSeconds}s old)`);
      }
    }

    return issues;
  }

  /**
   * Compute the final signal action based on dimension scores.
   * 
   * Key rule: No single indicator alone triggers BUY/SELL.
   * Must have supporting evidence from 2+ dimensions.
   */
  private computeAction(
    dimensions: DimensionScore[],
    hasStaleData: boolean,
    symbol: string,
    timestamp: string
  ): {
    action: SignalAction;
    confidence: number;
    score: number;
    supporting_dimensions_count: number;
    insufficient_data: boolean;
  } {
    // Filter to contributing dimensions
    const contributing = dimensions.filter(d => d.contributing);

    // Check for insufficient data
    if (contributing.length < 3) {
      return {
        action: 'INSUFFICIENT_DATA',
        confidence: 0,
        score: 50,
        supporting_dimensions_count: 0,
        insufficient_data: true
      };
    }

    if (hasStaleData) {
      return {
        action: 'INSUFFICIENT_DATA',
        confidence: 25,
        score: 50,
        supporting_dimensions_count: contributing.length,
        insufficient_data: true
      };
    }

    // Compute weighted average score
    const avgScore = contributing.reduce((sum, d) => sum + d.score, 0) / contributing.length;

    // Count dimensions above/below threshold
    const bullishDims = contributing.filter(d => d.score > 60).length;
    const bearishDims = contributing.filter(d => d.score < 40).length;

    // Decision logic
    let action: SignalAction = 'HOLD';
    let confidence = 50;

    if (bullishDims >= 3) {
      // Strong bullish: 3+ dimensions > 60
      action = 'STRONG_BUY';
      confidence = Math.min(95, 60 + bullishDims * 8);
    } else if (bullishDims === 2) {
      // Weak bullish: 2 dimensions > 60
      action = 'WEAK_BUY';
      confidence = Math.min(75, 50 + bullishDims * 12);
    } else if (bullishDims === 1 && avgScore > 60) {
      // Single indicator above 60? Treat as NO_TRADE unless very strong
      action = 'NO_TRADE';
      confidence = 40;
    } else if (bearishDims >= 3) {
      // Strong bearish
      action = 'STRONG_SELL';
      confidence = Math.min(95, 60 + bearishDims * 8);
    } else if (bearishDims === 2) {
      // Weak bearish
      action = 'WEAK_SELL';
      confidence = Math.min(75, 50 + bearishDims * 12);
    } else if (bearishDims === 1 && avgScore < 40) {
      // Single indicator below 40? Treat as NO_TRADE
      action = 'NO_TRADE';
      confidence = 40;
    } else {
      // Neutral: mixed or centered scores
      action = 'HOLD';
      confidence = Math.abs(avgScore - 50) * 0.5 + 25; // Scale confidence by distance from neutral
    }

    return {
      action,
      confidence: Math.round(confidence),
      score: Math.round(avgScore),
      supporting_dimensions_count: bullishDims + bearishDims,
      insufficient_data: false
    };
  }
}
