import { describe, expect, test } from 'vitest';

import { extractMentionedCommand } from '../src/bot/mention-command';
import type { OneBotMessageEvent } from '../src/types/domain';

function createEvent(message: OneBotMessageEvent['message']): OneBotMessageEvent {
  return {
    post_type: 'message',
    message_type: 'group',
    self_id: 123456,
    group_id: 1,
    user_id: 2,
    message,
  };
}

describe('extractMentionedCommand', () => {
  test('accepts a real self mention followed by a command', () => {
    expect(
      extractMentionedCommand(
        createEvent([
          { type: 'at', data: { qq: '123456' } },
          { type: 'text', data: { text: ' /sub 08' } },
        ]),
      ),
    ).toEqual({
      mentioned: true,
      commandText: '/sub 08',
    });
  });

  test('ignores commands without a real mention', () => {
    expect(
      extractMentionedCommand(createEvent([{ type: 'text', data: { text: '/sub 08' } }])),
    ).toEqual({
      mentioned: false,
      commandText: null,
    });
  });

  test('ignores mentions for another user', () => {
    expect(
      extractMentionedCommand(
        createEvent([
          { type: 'at', data: { qq: '999999' } },
          { type: 'text', data: { text: ' /sub 08' } },
        ]),
      ),
    ).toEqual({
      mentioned: false,
      commandText: null,
    });
  });

  test('rejects text before the bot mention', () => {
    expect(
      extractMentionedCommand(
        createEvent([
          { type: 'text', data: { text: 'hello ' } },
          { type: 'at', data: { qq: '123456' } },
          { type: 'text', data: { text: ' /sub 08' } },
        ]),
      ),
    ).toEqual({
      mentioned: false,
      commandText: null,
    });
  });
});
