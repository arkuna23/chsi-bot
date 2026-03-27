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
          return { command: null, error: '命令格式错误，用法：/sub <prefix>' };
        }
        return { command: { type: 'sub', prefix: normalizePrefix(parts[1]) }, error: null };
      case '/unsub':
        if (parts.length !== 2) {
          return { command: null, error: '命令格式错误，用法：/unsub <prefix>' };
        }
        return { command: { type: 'unsub', prefix: normalizePrefix(parts[1]) }, error: null };
      case '/region':
        if (parts.length < 3) {
          return { command: null, error: '命令格式错误，用法：/region <prefix> <province...>' };
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
          return { command: null, error: '命令格式错误，用法：/unregion <prefix>' };
        }
        return { command: { type: 'unregion', prefix: normalizePrefix(parts[1]) }, error: null };
      default:
        return { command: null, error: '不支持的指令，请发送 @机器人 /help 查看帮助。' };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      command: null,
      error:
        message === 'prefix must be 2 to 6 digits'
          ? '专业前缀格式错误，只能输入 2 到 6 位数字。'
          : message,
    };
  }
}
