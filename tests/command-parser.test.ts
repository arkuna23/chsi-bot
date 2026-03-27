import { describe, expect, test } from 'vitest';

import { parseCommand } from '../src/bot/command-parser';

describe('parseCommand', () => {
  test('parses sub command', () => {
    expect(parseCommand('/sub 08')).toEqual({
      command: { type: 'sub', prefix: '08' },
      error: null,
    });
  });

  test('parses region command', () => {
    expect(parseCommand('/region 0854 Jiangsu Beijing')).toEqual({
      command: {
        type: 'region',
        prefix: '0854',
        provinces: ['Jiangsu', 'Beijing'],
      },
      error: null,
    });
  });

  test('rejects invalid prefix', () => {
    expect(parseCommand('/sub abc')).toEqual({
      command: null,
      error: '专业前缀格式错误，只能输入 2 到 6 位数字。',
    });
  });

  test('returns Chinese usage errors', () => {
    expect(parseCommand('/region 08')).toEqual({
      command: null,
      error: '命令格式错误，用法：/region <prefix> <province...>',
    });
  });

  test('returns Chinese unknown command error', () => {
    expect(parseCommand('/noop')).toEqual({
      command: null,
      error: '不支持的指令，请发送 @机器人 /help 查看帮助。',
    });
  });
});
