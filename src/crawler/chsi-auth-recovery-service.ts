import type { AppConfig } from '../app/config';
import type { AuthRecoveryStatus } from '../types/domain';
import { Logger } from '../shared/logger';

import { ChsiCookieProvider } from './cookie-provider';
import { ChsiLoginService } from './chsi-login-service';

export class ChsiAuthRecoveryService {
  constructor(
    private readonly config: AppConfig,
    private readonly cookieProvider: ChsiCookieProvider,
    private readonly loginService: ChsiLoginService,
    private readonly logger: Logger = new Logger('ChsiAuthRecoveryService'),
  ) {}

  canAutoLogin(): boolean {
    return Boolean(this.config.chsiLoginUsername && this.config.chsiLoginPassword);
  }

  async recoverSession(): Promise<AuthRecoveryStatus> {
    if (!this.canAutoLogin()) {
      this.logger.warn('Skipping automatic CHSI login because credentials are not configured');
      return 'NONE';
    }

    this.cookieProvider.clearRuntimeCookieHeader();

    const result = await this.loginService.loginWithCredentials(
      this.config.chsiLoginUsername!,
      this.config.chsiLoginPassword!,
    );

    if (result.status === 'SUCCESS' && result.cookieHeader) {
      this.cookieProvider.setRuntimeCookieHeader(result.cookieHeader);
      this.logger.info('Automatic CHSI login succeeded');
      return 'AUTO_LOGIN_SUCCESS';
    }

    if (result.status === 'CHALLENGE_REQUIRED') {
      this.logger.warn('Automatic CHSI login requires manual verification', {
        message: result.message,
      });
      return 'CHALLENGE_REQUIRED';
    }

    this.logger.error('Automatic CHSI login failed', {
      message: result.message,
    });
    return 'AUTO_LOGIN_FAILED';
  }
}
