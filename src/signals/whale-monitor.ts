export class WhaleMonitor {
  async monitorTransactions(minAmount: number = 100000) {
    return {
      timestamp: new Date().toISOString(),
      largeTransactions: [],
      exchangeInflows: [],
      exchangeOutflows: []
    };
  }
}
