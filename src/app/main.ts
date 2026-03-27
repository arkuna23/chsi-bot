import { loadConfig } from './config';
import { SqliteDatabase } from '../storage/database';
import { SubscriptionService } from '../subscription/subscription-service';
import { DiffService } from '../subscription/diff-service';
import { NotificationService } from '../subscription/notification-service';
import { ChsiCookieProvider } from '../crawler/cookie-provider';
import { ChsiApiClient } from '../crawler/chsi-api-client';
import { ChsiCrawlerService } from '../crawler/chsi-crawler-service';
import { OneBotClient } from '../bot/onebot-client';
import { PollingCoordinator } from '../scheduler/polling-coordinator';
import { BotService } from '../bot/bot-service';
import { Logger } from '../shared/logger';

async function main(): Promise<void> {
  const logger = new Logger('App');
  const config = loadConfig({ requireBot: true });
  logger.info('Loaded application config', {
    sqlitePath: config.sqlitePath,
    chsiStorageStatePath: config.chsiStorageStatePath,
    chsiCookieFile: config.chsiCookieFile,
    chsiPageSize: config.chsiPageSize,
    chsiRequestIntervalMs: config.chsiRequestIntervalMs,
    pollIntervalMinutes: config.pollIntervalMinutes,
    adminGroupCount: config.adminGroupIds.length,
    oneBotWsUrl: config.oneBotWsUrl,
  });

  const database = new SqliteDatabase(config.sqlitePath);
  database.init();
  logger.info('Database initialized', { sqlitePath: config.sqlitePath });

  const subscriptionService = new SubscriptionService(database, logger.child('SubscriptionService'));
  const diffService = new DiffService(database, logger.child('DiffService'));
  const notificationService = new NotificationService(database, logger.child('NotificationService'));
  const cookieProvider = new ChsiCookieProvider(config);
  const apiClient = new ChsiApiClient(config, cookieProvider, logger.child('ChsiApiClient'));
  const crawlerService = new ChsiCrawlerService(apiClient, logger.child('ChsiCrawlerService'));
  const oneBotClient = new OneBotClient(
    config.oneBotWsUrl!,
    config.oneBotAccessToken,
    logger.child('OneBotClient'),
  );
  const pollingCoordinator = new PollingCoordinator(
    subscriptionService,
    crawlerService,
    diffService,
    notificationService,
    oneBotClient,
    database,
    logger,
    config.adminGroupIds,
  );
  const botService = new BotService(
    oneBotClient,
    subscriptionService,
    pollingCoordinator,
    logger.child('BotService'),
  );

  oneBotClient.onGroupMessage((event) => botService.handleMessage(event));
  await oneBotClient.connect();
  logger.info('OneBot connected and group message handler registered');

  const initialRun = await pollingCoordinator.runOnce();
  logger.info('Initial polling finished', initialRun);

  const timer = setInterval(() => {
    void pollingCoordinator
      .runOnce()
      .then((result) => {
        if (result) {
          logger.info('Polling finished', result);
        }
      })
      .catch((error) => {
        logger.error('Polling failed', error instanceof Error ? error.message : String(error));
      });
  }, config.pollIntervalMinutes * 60 * 1000);
  logger.info('Scheduled polling timer started', {
    intervalMinutes: config.pollIntervalMinutes,
  });

  const shutdown = async () => {
    logger.warn('Shutdown signal received, closing resources');
    clearInterval(timer);
    await oneBotClient.close();
    database.close();
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
