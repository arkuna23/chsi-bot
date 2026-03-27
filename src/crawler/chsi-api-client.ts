import { URLSearchParams } from "node:url";

import type { AppConfig } from "../app/config";
import { DEFAULT_CHSI_API_CONFIG } from "./default-api-config";
import { AuthExpiredError, ChsiApiError } from "./errors";
import type {
	AdjustmentListing,
	ChsiApiConfig,
	SessionStatus,
} from "../types/domain";
import { normalizePrefix } from "../shared/prefix";
import { normalizeProvinceCode } from "../shared/provinces";
import { firstDefined, nonEmptyString } from "../shared/text";
import { readJsonFile } from "../shared/fs";
import { sleep } from "../shared/time";
import { Logger } from "../shared/logger";
import { ChsiCookieProvider } from "./cookie-provider";

interface ChsiRecord {
	id?: string;
	ssdm?: string;
	ssmc?: string | null;
	dwdm?: string;
	dwmc?: string;
	yxsdm?: string;
	yxsmc?: string;
	zydm?: string;
	zymc?: string;
	yjfxdm?: string;
	yjfxmc?: string;
	xxfs?: string;
	zxjh?: string;
	fbsjStr?: string;
}

interface ChsiPageResponse {
	msg?: {
		flag?: boolean;
		message?: {
			page_error?: string | null;
			error?: Array<{ mc?: string | null }>;
		};
		data?: {
			vo_list?: {
				pagenation?: {
					curPage: number;
					pageCount: number;
					size: number;
					totalCount: number;
					totalPage: number;
					nextPageAvailable: boolean;
					previousPageAvailable: boolean;
					startOfLastPage: number;
					startOfNextPage: number;
					startOfPreviousPage: number;
				} | null;
				vos?: ChsiRecord[];
			};
		};
	};
	flag?: boolean;
	invokeStatus?: string;
}

export interface QueryPageResult {
	listings: AdjustmentListing[];
	nextStart: number | null;
	sessionStatus: SessionStatus;
}

function parseApiConfig(config: AppConfig): ChsiApiConfig {
	const fileConfig = readJsonFile<ChsiApiConfig>(config.chsiApiConfigPath);
	return {
		...DEFAULT_CHSI_API_CONFIG,
		...fileConfig,
	};
}

function isHtmlResponse(responseText: string): boolean {
	return /<!DOCTYPE html>|<html/i.test(responseText);
}

function createHeaders(cookieHeader: string): HeadersInit {
	return {
		Accept: "application/json, text/javascript, */*; q=0.01",
		"Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
		Cookie: cookieHeader,
		Referer: "https://yz.chsi.com.cn/sytj/tjyx/qecx.action",
		"User-Agent":
			"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
		"X-Requested-With": "XMLHttpRequest",
	};
}

function isNoDataResponse(payload: ChsiPageResponse): boolean {
	const errors = payload.msg?.message?.error ?? [];
	return errors.some((item) => (item.mc ?? "").includes("不存在"));
}

function extractPageError(payload: ChsiPageResponse): string | null {
	const pageError = payload.msg?.message?.page_error;
	if (pageError) {
		return pageError;
	}

	const errors = payload.msg?.message?.error ?? [];
	const firstError = errors.find((item) => item.mc);
	return firstError?.mc ?? null;
}

function extractYear(record: ChsiRecord): number {
	const published = nonEmptyString(record.fbsjStr);
	if (published) {
		const year = Number.parseInt(published.slice(0, 4), 10);
		if (Number.isFinite(year)) {
			return year;
		}
	}
	return new Date().getFullYear();
}

function toListing(record: ChsiRecord, prefix: string): AdjustmentListing {
	const schoolName = nonEmptyString(record.dwmc);
	const majorCode = nonEmptyString(record.zydm);
	const majorName = nonEmptyString(record.zymc);

	if (!schoolName || !majorCode || !majorName) {
		throw new ChsiApiError("listing missing required fields");
	}

	return {
		sourceId: nonEmptyString(record.id),
		year: extractYear(record),
		province: firstDefined(
			record.ssdm ? normalizeProvinceCode(record.ssdm) : null,
			nonEmptyString(record.ssmc),
			"未知",
		) as string,
		schoolName,
		schoolId: nonEmptyString(record.dwdm),
		majorCode,
		majorName,
		researchDirection: firstDefined(
			nonEmptyString(record.yjfxmc),
			nonEmptyString(record.yjfxdm),
		),
		learningMode: nonEmptyString(record.xxfs),
		specialProgram: nonEmptyString(record.zxjh),
		matchedPrefix: prefix,
		rawPayload: record as unknown as AdjustmentListing["rawPayload"],
	};
}

export class ChsiApiClient {
	private readonly apiConfig: ChsiApiConfig;
	private lastRequestStartedAt = 0;

	constructor(
		private readonly appConfig: AppConfig,
		private readonly cookieProvider: ChsiCookieProvider,
		private readonly logger: Logger = new Logger("ChsiApiClient"),
	) {
		this.apiConfig = parseApiConfig(appConfig);
	}

	async validateSession(): Promise<SessionStatus> {
		this.logger.info("Validating CHSI session");
		try {
			await this.queryPage("08", 0);
			this.logger.info("CHSI session is valid");
			return "VALID";
		} catch (error) {
			if (error instanceof AuthExpiredError) {
				this.logger.warn("CHSI session expired during validation");
				return "AUTH_EXPIRED";
			}
			this.logger.error(
				"CHSI session validation returned unknown status",
				error instanceof Error ? error.message : String(error),
			);
			return "UNKNOWN";
		}
	}

	async fetchAllByPrefix(prefixInput: string): Promise<AdjustmentListing[]> {
		const prefix = normalizePrefix(prefixInput);
		this.logger.info("Starting CHSI fetch by prefix", { prefix });
		const listings: AdjustmentListing[] = [];
		let start = 0;

		for (;;) {
			const page = await this.queryPage(prefix, start);
			listings.push(...page.listings);
			this.logger.debug("Fetched CHSI page", {
				prefix,
				start,
				pageCount: page.listings.length,
				accumulatedCount: listings.length,
				nextStart: page.nextStart,
			});
			if (page.nextStart === null) {
				break;
			}
			start = page.nextStart;
		}

		this.logger.info("Finished CHSI fetch by prefix", {
			prefix,
			totalCount: listings.length,
		});
		return listings;
	}

	private async queryPage(
		prefix: string,
		start: number,
	): Promise<QueryPageResult> {
		const params = new URLSearchParams({
			...this.apiConfig.staticParams,
			[this.apiConfig.prefixParam]: prefix,
		});

		if (this.apiConfig.pageParam) {
			params.set(this.apiConfig.pageParam, String(start));
		}

		params.set(
			this.apiConfig.pageSizeParam ?? "pageSize",
			String(this.appConfig.chsiPageSize),
		);

		await this.waitForRequestSlot();
		this.logger.debug("Sending CHSI page request", {
			prefix,
			start,
			pageSize: this.appConfig.chsiPageSize,
			url: this.apiConfig.queryUrl,
		});

		const response = await fetch(this.apiConfig.queryUrl, {
			method: this.apiConfig.method,
			headers: createHeaders(this.cookieProvider.getCookieHeader()),
			body: params.toString(),
		});

		const text = await response.text();
		if (isHtmlResponse(text)) {
			this.logger.warn("CHSI returned HTML response, treating as auth expired", {
				prefix,
				start,
				status: response.status,
			});
			throw new AuthExpiredError();
		}

		let payload: ChsiPageResponse;
		try {
			payload = JSON.parse(text) as ChsiPageResponse;
		} catch (error) {
			this.logger.error("Failed to parse CHSI JSON response", {
				prefix,
				start,
				error: error instanceof Error ? error.message : String(error),
			});
			throw new ChsiApiError(`invalid CHSI JSON response: ${String(error)}`);
		}

		if (payload.flag !== true || payload.invokeStatus !== "SUCCESS") {
			this.logger.error("CHSI request failed", {
				prefix,
				start,
				status: response.status,
				flag: payload.flag,
				invokeStatus: payload.invokeStatus,
			});
			throw new ChsiApiError("CHSI request failed");
		}

		const pageError = extractPageError(payload);
		if (pageError && pageError.includes("请选择学科专业")) {
			this.logger.warn("CHSI rejected prefix request", { prefix, start, pageError });
			throw new ChsiApiError(pageError);
		}

		if (isNoDataResponse(payload)) {
			this.logger.info("CHSI returned no data for prefix page", { prefix, start });
			return {
				listings: [],
				nextStart: null,
				sessionStatus: "VALID",
			};
		}

		const records = payload.msg?.data?.vo_list?.vos ?? [];
		const pagenation = payload.msg?.data?.vo_list?.pagenation ?? null;
		this.logger.debug("Received CHSI page response", {
			prefix,
			start,
			recordCount: records.length,
			nextStart: pagenation?.nextPageAvailable
				? pagenation.startOfNextPage
				: null,
			totalCount: pagenation?.totalCount ?? null,
		});

		return {
			listings: records.map((record) => toListing(record, prefix)),
			nextStart: pagenation?.nextPageAvailable
				? pagenation.startOfNextPage
				: null,
			sessionStatus: "VALID",
		};
	}

	private async waitForRequestSlot(): Promise<void> {
		const intervalMs = this.appConfig.chsiRequestIntervalMs;
		const now = Date.now();
		const nextAllowedAt = this.lastRequestStartedAt + intervalMs;

		if (now < nextAllowedAt) {
			this.logger.debug("Waiting before next CHSI request", {
				waitMs: nextAllowedAt - now,
			});
			await sleep(nextAllowedAt - now);
		}

		this.lastRequestStartedAt = Date.now();
	}
}
