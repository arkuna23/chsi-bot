import { loadConfig } from '../src/app/config';
import { ChsiLoginService } from '../src/crawler/chsi-login-service';
import { Logger } from '../src/shared/logger';

async function main(): Promise<void> {
  const config = loadConfig({ requireBot: false });
  const logger = new Logger('login:chsi');
  const loginService = new ChsiLoginService(config, logger.child('ChsiLoginService'));

  logger.info('已启动 CHSI 登录浏览器。请先手动完成登录，脚本会自动检测登录状态。');

  const result = await loginService.loginInteractively();
  if (result.status !== 'SUCCESS') {
    throw new Error(result.message);
  }

  logger.info(result.message);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
