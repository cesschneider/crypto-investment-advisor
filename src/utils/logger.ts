/**
 * Structured logger utility
 * No console.log — all output through logger methods
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

class Logger {
  private level: LogLevel = LogLevel.INFO;

  constructor(level?: LogLevel) {
    if (level) {
      this.level = level;
    }
  }

  private shouldLog(logLevel: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3
    };
    return levels[logLevel] >= levels[this.level];
  }

  private formatLog(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${timestamp}] ${level} - ${message}${dataStr}`;
  }

  debug(message: string, data?: any) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatLog(LogLevel.DEBUG, message, data));
    }
  }

  info(message: string, data?: any) {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatLog(LogLevel.INFO, message, data));
    }
  }

  warn(message: string, data?: any) {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatLog(LogLevel.WARN, message, data));
    }
  }

  error(message: string, data?: any) {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatLog(LogLevel.ERROR, message, data));
    }
  }
}

export default new Logger(LogLevel.INFO);
