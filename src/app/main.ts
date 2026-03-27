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
  const logger = new Logger();
  const config = loadConfig({ requireBot: true });
  const database = new SqliteDatabase(config.sqlitePath);
  database.init();

  const subscriptionService = new SubscriptionService(database);
  const diffService = new DiffService(database);
  const notificationService = new NotificationService(database);
  const cookieProvider = new ChsiCookieProvider(config);
  const apiClient = new ChsiApiClient(config, cookieProvider);
  const crawlerService = new ChsiCrawlerService(apiClient);
  const oneBotClient = new OneBotClient(config.oneBotWsUrl!, config.oneBotAccessToken);
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
  const botService = new BotService(oneBotClient, subscriptionService, pollingCoordinator);

  oneBotClient.onGroupMessage((event) => botService.handleMessage(event));
  await oneBotClient.connect();
  logger.info('OneBot connected');

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

  const shutdown = async () => {
    clearInterval(timer);
    await oneBotClient.close();
    database.close();
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
