import { loadConfig } from "../src/app/config";
import { ChsiCookieProvider } from "../src/crawler/cookie-provider";
import { ChsiApiClient } from "../src/crawler/chsi-api-client";
import { ChsiCrawlerService } from "../src/crawler/chsi-crawler-service";

async function main(): Promise<void> {
	const config = loadConfig({ requireBot: false });
	const prefixes = process.argv.slice(2);
	if (prefixes.length === 0) {
		throw new Error("usage: pnpm run run:once -- <prefix...>");
	}

	const crawler = new ChsiCrawlerService(
		new ChsiApiClient(config, new ChsiCookieProvider(config)),
	);
	const result = await crawler.crawlByMajorPrefixes(prefixes);

	for (const prefix of prefixes) {
		const listings = result.results.get(prefix) ?? [];
		console.log(listings);
		console.log(`${prefix}: ${listings.length}`);
	}

	if (result.errors.size > 0) {
		console.error(Object.fromEntries(result.errors.entries()));
		process.exitCode = 1;
	}
}

void main().catch((error) => {
	console.error(error);
	process.exit(1);
});
