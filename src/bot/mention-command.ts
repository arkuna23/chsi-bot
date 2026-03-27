import type {
  OneBotAtSegment,
  OneBotMessageEvent,
  OneBotMessageSegment,
  OneBotTextSegment,
} from '../types/domain';

export interface MentionedCommandResult {
  commandText: string | null;
  mentioned: boolean;
}

function isTextSegment(segment: OneBotMessageSegment): segment is OneBotTextSegment {
  return segment.type === 'text';
}

function isAtSegment(segment: OneBotMessageSegment): segment is OneBotAtSegment {
  return segment.type === 'at';
}

function getText(segment: OneBotTextSegment): string {
  return typeof segment.data.text === 'string' ? segment.data.text : '';
}

function isBlankTextSegment(segment: OneBotMessageSegment): boolean {
  return isTextSegment(segment) && getText(segment).trim().length === 0;
}

function isAtSelf(segment: OneBotMessageSegment, selfId: number): boolean {
  return isAtSegment(segment) && segment.data.qq === String(selfId);
}

export function extractMentionedCommand(event: OneBotMessageEvent): MentionedCommandResult {
  if (!Array.isArray(event.message) || event.self_id === undefined) {
    return { commandText: null, mentioned: false };
  }

  const segments = event.message;
  let index = 0;

  while (index < segments.length && isBlankTextSegment(segments[index])) {
    index += 1;
  }

  if (index >= segments.length || !isAtSelf(segments[index], event.self_id)) {
    return { commandText: null, mentioned: false };
  }

  index += 1;

  let remainder = '';
  for (; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!isTextSegment(segment)) {
      return { commandText: null, mentioned: true };
    }

    remainder += getText(segment);
  }

  const normalized = remainder.trimStart();
  if (!normalized.startsWith('/')) {
    return { commandText: null, mentioned: true };
  }

  return {
    commandText: normalized.trim(),
    mentioned: true,
  };
}
