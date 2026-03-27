export class Logger {
  constructor(private readonly scope?: string) {}

  child(scope: string): Logger {
    return new Logger(this.scope ? `${this.scope}:${scope}` : scope);
  }

  debug(message: string, extra?: unknown): void {
    this.log('DEBUG', message, extra);
  }

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
    const prefix = this.scope
      ? `[${new Date().toISOString()}] [${level}] [${this.scope}]`
      : `[${new Date().toISOString()}] [${level}]`;
    if (extra === undefined) {
      console.log(prefix, message);
      return;
    }

    console.log(prefix, message, this.serialize(extra));
  }

  private serialize(extra: unknown): string {
    if (typeof extra === 'string') {
      return extra;
    }

    if (extra instanceof Error) {
      return JSON.stringify({
        name: extra.name,
        message: extra.message,
        stack: extra.stack,
      });
    }

    try {
      return JSON.stringify(extra);
    } catch {
      return String(extra);
    }
  }
}
