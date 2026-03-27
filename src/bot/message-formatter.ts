import type {
  AuthRecoveryStatus,
  GroupSubscription,
  PollRunResult,
  PrefixSubscription,
} from '../types/domain';

function formatPrefixes(group: GroupSubscription | null): string {
  if (!group || group.prefixes.length === 0) {
    return '无';
  }

  return group.prefixes
    .map((prefix) => {
      if (prefix.regions.length === 0) {
        return `${prefix.prefix}（仅汇总通知）`;
      }

      return `${prefix.prefix}（地区细分：${prefix.regions.join('、')}）`;
    })
    .join('\n');
}

function getPrefix(group: GroupSubscription, prefixValue: string): PrefixSubscription | null {
  return group.prefixes.find((prefix) => prefix.prefix === prefixValue) ?? null;
}

export function buildHelpMessage(): string {
  return [
    '调剂监听帮助',
    '使用规则：所有指令都必须以真实 @机器人 开头，例如“@机器人 /sub 08”。',
    '补充说明：专业前缀只能是 2 到 6 位数字；省份名称支持常见中文名和英文名。',
    '',
    '/on',
    '说明：启用当前群的调剂监听功能。',
    '示例：@机器人 /on',
    '',
    '/off',
    '说明：关闭当前群的调剂监听功能，已保存的订阅不会被删除。',
    '示例：@机器人 /off',
    '',
    '/sub <prefix>',
    '说明：订阅一个学科专业前缀，例如 08、0812、0854。',
    '示例：@机器人 /sub 08',
    '',
    '/unsub <prefix>',
    '说明：取消一个学科专业前缀的订阅，并清除该前缀下的地区细分设置。',
    '示例：@机器人 /unsub 08',
    '',
    '/ls',
    '说明：查看当前群的监听状态、订阅列表和地区细分设置。',
    '示例：@机器人 /ls',
    '',
    '/region <prefix> <province...>',
    '说明：为某个前缀开启地区细分提醒，后续会额外推送这些地区的学校级新增详情。',
    '示例：@机器人 /region 08 江苏 北京',
    '',
    '/unregion <prefix>',
    '说明：清除某个前缀的地区细分提醒，后续只保留汇总通知。',
    '示例：@机器人 /unregion 08',
    '',
    '/check',
    '说明：立即手动执行一次当前群相关订阅的检查。',
    '示例：@机器人 /check',
    '',
    '/help',
    '说明：查看这份帮助说明。',
    '示例：@机器人 /help',
  ].join('\n');
}

export function buildGroupStatusMessage(group: GroupSubscription | null): string {
  if (!group) {
    return [
      '当前群尚未初始化监听配置。',
      '如需开始使用，请先发送：@机器人 /on',
    ].join('\n');
  }

  return [
    '当前群监听状态',
    `监听开关：${group.enabled ? '已启用' : '未启用'}`,
    `订阅数量：${group.prefixes.length}`,
    '订阅详情：',
    formatPrefixes(group),
    group.enabled
      ? '如需新增订阅，可发送：@机器人 /sub 08'
      : '当前群尚未启用监听。启用后才会参与定时检查：@机器人 /on',
  ].join('\n');
}

export function buildEnableMessage(group: GroupSubscription): string {
  return [
    '已启用当前群的调剂监听。',
    group.prefixes.length > 0
      ? `当前已保存 ${group.prefixes.length} 个订阅，系统会在定时任务中开始检查。`
      : '当前还没有任何订阅，请继续发送：@机器人 /sub 08',
  ].join('\n');
}

export function buildDisableMessage(group: GroupSubscription): string {
  return [
    '已关闭当前群的调剂监听。',
    group.prefixes.length > 0
      ? `已保存的 ${group.prefixes.length} 个订阅不会被删除，之后重新发送 @机器人 /on 即可恢复。`
      : '当前没有已保存的订阅。',
  ].join('\n');
}

export function buildSubscribeMessage(group: GroupSubscription, prefix: string): string {
  return [
    `已订阅专业前缀 ${prefix}。`,
    `当前订阅数量：${group.prefixes.length}`,
    '当前订阅详情：',
    formatPrefixes(group),
    group.enabled
      ? '后续定时检查将自动包含该前缀。'
      : '当前群尚未启用监听。若要开始定时检查，请发送：@机器人 /on',
  ].join('\n');
}

export function buildUnsubscribeMessage(group: GroupSubscription, prefix: string): string {
  return [
    `已取消专业前缀 ${prefix} 的订阅。`,
    '该前缀关联的地区细分设置也已一并清除。',
    `当前剩余订阅数量：${group.prefixes.length}`,
    '当前订阅详情：',
    formatPrefixes(group),
  ].join('\n');
}

export function buildRegionMessage(group: GroupSubscription, prefix: string): string {
  const current = getPrefix(group, prefix);

  return [
    `已更新专业前缀 ${prefix} 的地区细分提醒。`,
    current && current.regions.length > 0
      ? `后续将额外推送以下地区的学校级新增详情：${current.regions.join('、')}`
      : '当前没有任何地区细分设置。',
    '汇总通知仍会按该前缀正常发送。',
  ].join('\n');
}

export function buildUnregionMessage(prefix: string): string {
  return [
    `已清除专业前缀 ${prefix} 的地区细分提醒。`,
    '后续该前缀只保留汇总通知，不再发送学校级地区细分详情。',
  ].join('\n');
}

export function buildCheckingMessage(): string {
  return '开始检查当前群的调剂信息，请稍候。';
}

export function buildEnableFirstMessage(): string {
  return [
    '当前群尚未启用监听，暂时不能执行手动检查。',
    '请先发送：@机器人 /on',
  ].join('\n');
}

export function buildRunningMessage(): string {
  return '当前已有检查任务在运行，请稍后再试。';
}

export function buildAuthExpiredMessage(authRecoveryStatus: AuthRecoveryStatus): string {
  switch (authRecoveryStatus) {
    case 'AUTO_LOGIN_FAILED':
      return [
        '检查失败：CHSI 登录态已失效。',
        '系统已尝试自动重新登录，但未成功。',
        '请检查环境变量中的账号密码，或手动重新执行登录流程。',
      ].join('\n');
    case 'CHALLENGE_REQUIRED':
      return [
        '检查失败：CHSI 登录态已失效。',
        '系统尝试自动重新登录时遇到验证码或短信验证。',
        '请人工完成登录后再重试。',
      ].join('\n');
    default:
      return [
        '检查失败：CHSI 登录态已失效。',
        '当前未配置自动重新登录账号密码。',
        '请手动重新执行登录流程，或在环境变量中补充账号密码后再试。',
      ].join('\n');
  }
}

export function buildCheckResultMessage(result: PollRunResult): string {
  const lines = ['检查完成。'];

  if (result.authRecoveryStatus === 'AUTO_LOGIN_SUCCESS') {
    lines.push('检测到登录态失效后，系统已自动重新登录并完成本次检查。');
  }

  lines.push(
    `抓取前缀：${result.prefixes.length > 0 ? result.prefixes.join('、') : '无'}`,
    `实际完成抓取的前缀数：${result.crawledPrefixes.length}`,
    `新增记录：${result.newListingCount} 条`,
    `内容更新：${result.updatedListingCount} 条`,
  );

  if (result.prefixes.length === 0) {
    lines.push('当前群还没有任何订阅前缀，请先发送：@机器人 /sub 08');
  }

  const errorEntries = Object.entries(result.errors);
  if (errorEntries.length > 0) {
    lines.push('以下前缀抓取失败：');
    lines.push(...errorEntries.map(([prefix, error]) => `${prefix}：${error}`));
  } else {
    lines.push('本次没有出现抓取错误。');
  }

  return lines.join('\n');
}

export function buildUnknownCommandMessage(): string {
  return '无法识别这条指令，请发送 @机器人 /help 查看可用命令。';
}
