/**
 * Simple Logger utility
 */
export class Logger {
  constructor(private context: string) {}

  log(message: string, data?: any) {
    // Do not log
  }

  info(message: string, data?: any) {
    // Do not log in production
  }

  error(message: string, error?: any) {
    // Do not log sensitive data
    if (error?.message) {
      console.error(`[${this.context}] ${message}:`, error.message);
    }
  }

  warn(message: string, data?: any) {
    // Minimal logging
  }
}
