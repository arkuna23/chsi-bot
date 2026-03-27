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
      error: 'prefix must be 2 to 6 digits',
    });
  });
});
