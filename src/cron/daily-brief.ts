export async function runDailyBrief() {
  return { briefing: {}, timestamp: new Date().toISOString() };
}
