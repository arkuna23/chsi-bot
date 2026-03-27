export class Logger {
  info(message: string, extra?: unknown): void {
    this.log('INFO', message, extra);
  }

  warn(message: string, extra?: unknown): void {
    this.log('WARN', message, extra);
  }

  error(message: string, extra?: unknown): void {
    this.log('ERROR', message, extra);
  }

  private log(level: string, message: string, extra?: unknown): void {
    const prefix = `[${new Date().toISOString()}] [${level}]`;
    if (extra === undefined) {
      console.log(prefix, message);
      return;
    }
    console.log(prefix, message, extra);
  }
}
