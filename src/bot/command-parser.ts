import type { ParsedCommand } from '../types/domain';
import { normalizePrefix } from '../shared/prefix';

function tokenize(input: string): string[] {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function parseCommand(input: string): ParsedCommand {
  const parts = tokenize(input);
  if (parts.length === 0 || !parts[0].startsWith('/')) {
    return { command: null, error: null };
  }

  const command = parts[0].toLowerCase();

  try {
    switch (command) {
      case '/on':
        return { command: { type: 'on' }, error: null };
      case '/off':
        return { command: { type: 'off' }, error: null };
      case '/help':
        return { command: { type: 'help' }, error: null };
      case '/ls':
        return { command: { type: 'list' }, error: null };
      case '/check':
        return { command: { type: 'check' }, error: null };
      case '/sub':
        if (parts.length !== 2) {
          return { command: null, error: 'usage: /sub <prefix>' };
        }
        return { command: { type: 'sub', prefix: normalizePrefix(parts[1]) }, error: null };
      case '/unsub':
        if (parts.length !== 2) {
          return { command: null, error: 'usage: /unsub <prefix>' };
        }
        return { command: { type: 'unsub', prefix: normalizePrefix(parts[1]) }, error: null };
      case '/region':
        if (parts.length < 3) {
          return { command: null, error: 'usage: /region <prefix> <province...>' };
        }
        return {
          command: {
            type: 'region',
            prefix: normalizePrefix(parts[1]),
            provinces: parts.slice(2),
          },
          error: null,
        };
      case '/unregion':
        if (parts.length !== 2) {
          return { command: null, error: 'usage: /unregion <prefix>' };
        }
        return { command: { type: 'unregion', prefix: normalizePrefix(parts[1]) }, error: null };
      default:
        return { command: null, error: 'unknown command' };
    }
  } catch (error) {
    return {
      command: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
