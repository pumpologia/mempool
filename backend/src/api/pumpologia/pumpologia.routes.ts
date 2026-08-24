import axios, { isAxiosError } from 'axios';
import { Application, Request, Response } from 'express';
import logger from '../../logger';

const API_PREFIX = '/api/pumpologia/v1';
const HASH_REGEX = /^[a-f0-9]{64}$/i;
const POSITION_REGEX = /^[a-f0-9]{64}:\d+$/i;
const TICK_REGEX = /^[a-z0-9]{1,32}$/i;
const STATE_REGEX = /^[a-z_]{1,32}$/i;
const DIRECTION_REGEX = /^(long|short)$/i;
const INDEXER_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const CACHE_TTL_MS = 10_000;

type IndexerRecord = Record<string, unknown>;

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

interface PositionRecord extends IndexerRecord {
  position_id?: string;
  tick_canonical?: string;
  state?: string;
  direction?: string;
}

interface OperationRecord extends IndexerRecord {
  txid?: string | null;
  block_height?: number;
  op?: string;
  status?: string;
  tick_canonical?: string;
  position_id?: string;
}

interface SyncRecord extends IndexerRecord {
  checkpoint_height?: number;
  checkpoint_hash?: string;
  operation_count?: number;
}

class PumpologiaRoutes {
  private readonly tag = 'Pumpologia';
  private readonly cache = new Map<string, CacheEntry>();
  private readonly enabled = process.env.PUMPOLOGIA_INDEXER_ENABLED === 'true';
  private readonly indexerUrl = (process.env.PUMPOLOGIA_INDEXER_URL || 'http://127.0.0.1:8088').replace(/\/$/, '');

  public initRoutes(app: Application): void {
    if (!this.enabled) {
      logger.info('Pumpologia public API gateway is disabled', this.tag);
      return;
    }

    // This deliberately is not a mirror of the indexer API. Only the fields
    // required by the public trading terminal leave this gateway.
    app
      .get(`${API_PREFIX}/summary`, this.$getSummary.bind(this))
      .get(`${API_PREFIX}/positions`, this.$getPositions.bind(this))
      .get(`${API_PREFIX}/positions/:positionId`, this.$getPosition.bind(this))
      .get(`${API_PREFIX}/leaderboard`, this.$getLeaderboard.bind(this))
      .get(`${API_PREFIX}/operations`, this.$getOperations.bind(this))
      .get(`${API_PREFIX}/operations/:txid`, this.$getOperation.bind(this));

    logger.notice(`Pumpologia trading API enabled for ${this.indexerUrl}`, this.tag);
  }

  private async $getSummary(_req: Request, res: Response): Promise<void> {
    try {
      const cached = this.getCached('public-summary');
      if (cached !== undefined) {
        this.sendJson(res, cached, 10);
        return;
      }

      const [syncRaw, tokensRaw, positionsRaw, leaderboardRaw, operationsRaw] = await Promise.all([
        this.getIndexer('sync'),
        this.getIndexer('tokens'),
        this.getIndexer('positions'),
        this.getIndexer('leaderboard', { limit: 5 }),
        this.getIndexer('operations', { limit: 12 }),
      ]);
      const sync = this.asRecord(syncRaw) as SyncRecord;
      const markPrice = await this.getMarkPrice(sync);
      const positions = Array.isArray(positionsRaw) ? positionsRaw as PositionRecord[] : [];
      const states = positions.reduce<Record<string, number>>((counts, position) => {
        const state = this.text(position.state, 'UNKNOWN').toUpperCase();
        counts[state] = (counts[state] || 0) + 1;
        return counts;
      }, {});
      const leaderboard = this.asRecord(leaderboardRaw);
      const operationResponse = this.asRecord(operationsRaw);
      const operations = Array.isArray(operationResponse.items) ? operationResponse.items as OperationRecord[] : [];
      const enrichedOperations = await this.sanitizeOperations(operations, markPrice);

      const data = {
        as_of: {
          block_height: this.number(sync.checkpoint_height),
          block_hash: this.text(sync.checkpoint_hash),
          indexed_operations: this.number(sync.operation_count),
        },
        mark_price_usd: markPrice,
        markets: (Array.isArray(tokensRaw) ? tokensRaw : []).map(token => {
          const record = this.asRecord(token);
          return {
            symbol: this.text(record.tick_canonical).toUpperCase(),
            status: this.text(record.state).toUpperCase(),
          };
        }),
        positions: {
          total: positions.length,
          open: states.OPEN || 0,
          closed: states.CLOSED || 0,
          liquidated: states.LIQUIDATED || 0,
          expired: states.EXPIRED || 0,
          open_interest_sats: positions
            .filter(position => this.text(position.state).toUpperCase() === 'OPEN')
            .reduce((sum, position) => sum + BigInt(this.integerText(position.notional_sats)), 0n)
            .toString(),
          open_margin_sats: positions
            .filter(position => this.text(position.state).toUpperCase() === 'OPEN')
            .reduce((sum, position) => sum + BigInt(this.integerText(position.amt_sats)), 0n)
            .toString(),
        },
        traders: this.number(leaderboard.total),
        top_traders: this.sanitizeLeaderboardItems(leaderboard.items),
        recent_activity: enrichedOperations,
      };
      this.setCached('public-summary', data);
      this.sendJson(res, data, 10);
    } catch (error) {
      this.sendUpstreamError(res, error, 'summary');
    }
  }

  private async $getPositions(req: Request, res: Response): Promise<void> {
    const tick = this.optionalString(req.query.tick, TICK_REGEX);
    const state = this.optionalString(req.query.state, STATE_REGEX);
    const direction = this.optionalString(req.query.direction, DIRECTION_REGEX);
    const limit = this.parseInteger(req.query.limit, 1, 100, 50);
    const offset = this.parseInteger(req.query.offset, 0, 100_000, 0);
    if (tick === null || state === null || direction === null || limit === null || offset === null) {
      this.sendValidationError(res, 'invalid positions filter');
      return;
    }

    try {
      const [raw, syncRaw] = await Promise.all([this.getIndexer('positions'), this.getIndexer('sync')]);
      const markPrice = await this.getMarkPrice(this.asRecord(syncRaw) as SyncRecord);
      let items = Array.isArray(raw) ? raw as PositionRecord[] : [];
      if (tick) {
        items = items.filter(position => this.text(position.tick_canonical).toLowerCase() === tick.toLowerCase());
      }
      if (state) {
        items = items.filter(position => this.text(position.state).toLowerCase() === state.toLowerCase());
      }
      if (direction) {
        items = items.filter(position => this.text(position.direction).toLowerCase() === direction.toLowerCase());
      }
      this.sendJson(res, {
        items: items.slice(offset, offset + limit).map(position => this.sanitizePosition(position, markPrice)),
        total: items.length,
        limit,
        offset,
      }, 10);
    } catch (error) {
      this.sendUpstreamError(res, error, 'positions');
    }
  }

  private async $getPosition(req: Request, res: Response): Promise<void> {
    if (!POSITION_REGEX.test(req.params.positionId)) {
      this.sendValidationError(res, 'invalid position id');
      return;
    }
    try {
      const [raw, syncRaw] = await Promise.all([
        this.getIndexer(`positions/${encodeURIComponent(req.params.positionId)}`),
        this.getIndexer('sync'),
      ]);
      const markPrice = await this.getMarkPrice(this.asRecord(syncRaw) as SyncRecord);
      this.sendJson(res, this.sanitizePosition(this.asRecord(raw) as PositionRecord, markPrice), 10);
    } catch (error) {
      this.sendUpstreamError(res, error, 'position');
    }
  }

  private async $getLeaderboard(req: Request, res: Response): Promise<void> {
    const period = this.optionalString(req.query.period, /^(all|24h|7d|30d)$/i);
    const tick = this.optionalString(req.query.tick, TICK_REGEX);
    const limit = this.parseInteger(req.query.limit, 1, 100, 50);
    const offset = this.parseInteger(req.query.offset, 0, 100_000, 0);
    if (period === null || tick === null || limit === null || offset === null) {
      this.sendValidationError(res, 'invalid leaderboard filter');
      return;
    }

    try {
      const query: Record<string, string | number> = { limit, offset };
      if (period) {
        query.period = period;
      }
      if (tick) {
        query.tick = tick.toLowerCase();
      }
      const raw = this.asRecord(await this.getIndexer('leaderboard', query));
      this.sendJson(res, {
        as_of_height: this.number(raw.as_of_height),
        items: this.sanitizeLeaderboardItems(raw.items),
        total: this.number(raw.total),
        period: this.text(raw.period, period || 'all'),
      }, 15);
    } catch (error) {
      this.sendUpstreamError(res, error, 'leaderboard');
    }
  }

  private async $getOperations(req: Request, res: Response): Promise<void> {
    const limit = this.parseInteger(req.query.limit, 1, 50, 25);
    const blockHeight = this.parseOptionalInteger(req.query.block_height, 0, 10_000_000);
    const op = this.optionalString(req.query.op, STATE_REGEX);
    const status = this.optionalString(req.query.status, STATE_REGEX);
    const tick = this.optionalString(req.query.tick, TICK_REGEX);
    if (limit === null || blockHeight === null || op === null || status === null || tick === null) {
      this.sendValidationError(res, 'invalid operations filter');
      return;
    }

    try {
      let items: OperationRecord[];
      if (blockHeight !== undefined || op || status || tick) {
        items = await this.getFilteredOperations({ blockHeight, op, status, tick }, limit);
      } else {
        const raw = this.asRecord(await this.getIndexer('operations', { limit }));
        items = Array.isArray(raw.items) ? raw.items as OperationRecord[] : [];
      }
      const sync = this.asRecord(await this.getIndexer('sync')) as SyncRecord;
      const markPrice = await this.getMarkPrice(sync);
      this.sendJson(res, { items: await this.sanitizeOperations(items, markPrice) }, 10);
    } catch (error) {
      this.sendUpstreamError(res, error, 'operations');
    }
  }

  /** @asyncUnsafe */
  private async getFilteredOperations(
    filters: { blockHeight?: number; op?: string; status?: string; tick?: string },
    limit: number,
  ): Promise<OperationRecord[]> {
    const matches: OperationRecord[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 40 && matches.length < limit; page++) {
      const query: Record<string, string | number> = { limit: 100 };
      if (cursor) {
        query.cursor = cursor;
      }
      const response = this.asRecord(await this.getIndexer('operations', query));
      const items = Array.isArray(response.items) ? response.items as OperationRecord[] : [];
      for (const item of items) {
        if (filters.blockHeight !== undefined && item.block_height !== filters.blockHeight) continue;
        if (filters.op && this.text(item.op).toLowerCase() !== filters.op.toLowerCase()) continue;
        if (filters.status && this.text(item.status).toLowerCase() !== filters.status.toLowerCase()) continue;
        if (filters.tick && this.text(item.tick_canonical).toLowerCase() !== filters.tick.toLowerCase()) continue;
        matches.push(item);
        if (matches.length >= limit) break;
      }
      const nextCursor = this.text(response.next_cursor);
      if (!nextCursor || items.length === 0) break;
      if (filters.blockHeight !== undefined) {
        const heights = items.map(item => item.block_height).filter((height): height is number => typeof height === 'number');
        if (heights.length && Math.min(...heights) < filters.blockHeight) break;
      }
      cursor = nextCursor;
    }
    return matches;
  }

  private async $getOperation(req: Request, res: Response): Promise<void> {
    if (!HASH_REGEX.test(req.params.txid)) {
      this.sendValidationError(res, 'invalid transaction id');
      return;
    }
    try {
      const [raw, syncRaw] = await Promise.all([
        this.getIndexer(`operations/${req.params.txid}`),
        this.getIndexer('sync'),
      ]);
      const record = this.asRecord(raw);
      const items = Array.isArray(record.operations) ? record.operations as OperationRecord[] : [];
      const markPrice = await this.getMarkPrice(this.asRecord(syncRaw) as SyncRecord);
      this.sendJson(res, {
        txid: req.params.txid.toLowerCase(),
        items: await this.sanitizeOperations(items, markPrice),
      }, 10);
    } catch (error) {
      this.sendUpstreamError(res, error, 'operation');
    }
  }

  private sanitizePosition(position: PositionRecord, indexedMarkPrice: number | null): IndexerRecord {
    const state = this.text(position.state, 'UNKNOWN').toUpperCase();
    const direction = this.text(position.direction).toLowerCase();
    const leverage = this.number(position.leverage);
    const entryPrice = this.nullableNumber(position.entry_price);
    const exitPrice = this.nullableNumber(position.exit_price);
    const observedMark = this.nullableNumber(position.observed_mark_price);
    const markPrice = state === 'OPEN' ? indexedMarkPrice : (observedMark ?? exitPrice);
    const notional = this.integerText(position.notional_sats);
    const margin = this.integerText(position.amt_sats);
    let pnlUsd: string | null = null;
    let pnlKind: 'unrealized' | 'realized' | 'none' = 'none';

    if (state === 'OPEN' && entryPrice !== null && markPrice !== null && notional !== '0') {
      const priceDelta = direction === 'short' ? entryPrice - markPrice : markPrice - entryPrice;
      pnlUsd = this.formatFraction(BigInt(notional) * BigInt(priceDelta), 100_000_000n, 2);
      pnlKind = 'unrealized';
    } else if (position.pnl_numerator !== null && position.pnl_numerator !== undefined
      && position.pnl_denominator !== null && position.pnl_denominator !== undefined) {
      pnlUsd = this.formatFraction(
        BigInt(this.integerText(position.pnl_numerator)),
        BigInt(this.integerText(position.pnl_denominator)),
        2,
      );
      pnlKind = 'realized';
    }

    const referencePrice = exitPrice ?? markPrice;
    let returnBps: number | null = null;
    if (entryPrice && referencePrice !== null && leverage) {
      const priceDelta = direction === 'short' ? entryPrice - referencePrice : referencePrice - entryPrice;
      returnBps = Math.trunc((priceDelta * leverage * 10_000) / entryPrice);
    }

    const positionId = this.text(position.position_id || position.current_position_id);
    return {
      position_id: positionId,
      txid: positionId.split(':')[0] || null,
      market: this.text(position.tick_canonical).toUpperCase(),
      side: direction,
      status: state,
      margin_sats: margin,
      leverage,
      notional_sats: notional,
      open_height: this.number(position.open_height),
      close_height: this.nullableNumber(position.close_height),
      entry_price_usd: entryPrice,
      mark_price_usd: markPrice,
      exit_price_usd: exitPrice,
      liquidation_price_usd: this.priceFromFraction(position.liquidation_price_numerator, position.liquidation_price_denominator),
      take_profit_price_usd: this.priceFromFraction(position.take_profit_price_numerator, position.take_profit_price_denominator),
      stop_loss_price_usd: this.priceFromFraction(position.stop_loss_price_numerator, position.stop_loss_price_denominator),
      take_profit_bps: this.number(position.take_profit_bps),
      stop_loss_bps: this.number(position.stop_loss_bps),
      pnl_usd: pnlUsd,
      pnl_kind: pnlKind,
      return_bps: returnBps,
      outcome: this.nullableText(position.outcome)?.toUpperCase() || null,
      close_reason: this.humanize(this.nullableText(position.terminal_reason)),
    };
  }

  private async sanitizeOperations(items: OperationRecord[], markPrice: number | null): Promise<IndexerRecord[]> {
    const positionIds = Array.from(new Set(items.map(item => this.text(item.position_id)).filter(id => POSITION_REGEX.test(id))));
    const positions = new Map<string, PositionRecord>();
    await Promise.all(positionIds.map(async positionId => {
      try {
        positions.set(positionId, this.asRecord(await this.getIndexer(`positions/${encodeURIComponent(positionId)}`)) as PositionRecord);
      } catch {
        // A protocol event can outlive a position lookup. The event still gets a minimal card.
      }
    }));

    return items.map(item => {
      const positionId = this.text(item.position_id);
      const position = positions.get(positionId);
      const trade = position ? this.sanitizePosition(position, markPrice) : this.sanitizePosition(item as PositionRecord, markPrice);
      return {
        txid: this.nullableText(item.txid),
        block_height: this.number(item.block_height),
        type: this.humanize(this.text(item.op)) || 'Protocol event',
        status: this.text(item.status, 'valid').toUpperCase(),
        position_id: positionId || null,
        market: trade.market,
        side: trade.side,
        trade_status: trade.status,
        margin_sats: trade.margin_sats,
        leverage: trade.leverage,
        notional_sats: trade.notional_sats,
        entry_price_usd: trade.entry_price_usd,
        mark_price_usd: trade.mark_price_usd,
        exit_price_usd: trade.exit_price_usd,
        pnl_usd: trade.pnl_usd,
        pnl_kind: trade.pnl_kind,
        return_bps: trade.return_bps,
        outcome: trade.outcome,
      };
    });
  }

  private sanitizeLeaderboardItems(value: unknown): IndexerRecord[] {
    if (!Array.isArray(value)) return [];
    return value.map(item => {
      const entry = this.asRecord(item);
      const rank = this.number(entry.rank);
      const pnlFraction = this.asRecord(entry.pnl_usd);
      let pnlUsd: string | null = null;
      if (pnlFraction.numerator !== undefined && pnlFraction.denominator !== undefined) {
        pnlUsd = this.formatFraction(
          BigInt(this.integerText(pnlFraction.numerator)),
          BigInt(this.integerText(pnlFraction.denominator)),
          2,
        );
      }
      return {
        rank,
        trader: `Trader #${rank}`,
        pnl_usd: pnlUsd,
        pnl_sats: this.integerText(entry.pnl_sats),
        average_return_bps: this.number(entry.average_return_bps),
        trades: this.number(entry.trade_count),
        wins: this.number(entry.wins),
        losses: this.number(entry.losses),
        last_trade_height: this.number(entry.last_trade_height),
      };
    });
  }

  private async getMarkPrice(sync: SyncRecord): Promise<number | null> {
    const height = this.number(sync.checkpoint_height);
    if (!height) return null;
    try {
      const oracle = this.asRecord(await this.getIndexer(`oracle/prices/${height}`));
      return this.nullableNumber(oracle.price_usd);
    } catch {
      return null;
    }
  }

  private priceFromFraction(numerator: unknown, denominator: unknown): number | null {
    if (numerator === null || numerator === undefined || denominator === null || denominator === undefined) return null;
    const divisor = Number(denominator);
    return divisor ? Number(numerator) / divisor : null;
  }

  /** @asyncUnsafe */
  private async getIndexer(path: string, params: Record<string, string | number> = {}): Promise<unknown> {
    const cacheKey = `${path}?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString()}`;
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) return cached;
    const response = await axios.get(`${this.indexerUrl}/${path}`, {
      params,
      timeout: INDEXER_TIMEOUT_MS,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxBodyLength: MAX_RESPONSE_BYTES,
      headers: { Accept: 'application/json' },
    });
    this.setCached(cacheKey, response.data);
    return response.data;
  }

  private sendJson(res: Response, data: unknown, maxAgeSeconds: number): void {
    res
      .setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}, stale-while-revalidate=30`)
      .setHeader('X-Content-Type-Options', 'nosniff')
      .status(200)
      .json(data);
  }

  private sendUpstreamError(res: Response, error: unknown, path: string): void {
    if (isAxiosError(error) && error.response?.status === 404) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    logger.err(`Pumpologia indexer request failed for ${path}: ${error instanceof Error ? error.message : String(error)}`, this.tag);
    res.status(502).json({ error: 'temporarily_unavailable' });
  }

  private sendValidationError(res: Response, message: string): void {
    res.status(400).json({ error: 'invalid_request', message });
  }

  private asRecord(value: unknown): IndexerRecord {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as IndexerRecord : {};
  }

  private text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : (value === null || value === undefined ? fallback : String(value));
  }

  private nullableText(value: unknown): string | null {
    const result = this.text(value);
    return result ? result : null;
  }

  private number(value: unknown): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  }

  private nullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  private integerText(value: unknown): string {
    const result = this.text(value, '0');
    return /^-?\d+$/.test(result) ? result : '0';
  }

  private humanize(value: string | null): string | null {
    if (!value) return null;
    return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  }

  private formatFraction(numerator: bigint, denominator: bigint, decimals: number): string | null {
    if (denominator === 0n) return null;
    const negative = (numerator < 0n) !== (denominator < 0n);
    const absoluteNumerator = numerator < 0n ? -numerator : numerator;
    const absoluteDenominator = denominator < 0n ? -denominator : denominator;
    const scale = 10n ** BigInt(decimals);
    const rounded = ((absoluteNumerator * scale) + (absoluteDenominator / 2n)) / absoluteDenominator;
    const whole = rounded / scale;
    const fraction = (rounded % scale).toString().padStart(decimals, '0');
    return `${negative && rounded !== 0n ? '-' : ''}${whole}.${fraction}`;
  }

  private getCached(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private setCached(key: string, value: unknown): void {
    if (this.cache.size >= 128) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  private optionalString(value: unknown, regex: RegExp): string | undefined | null {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !regex.test(value)) return null;
    return value;
  }

  private parseInteger(value: unknown, min: number, max: number, fallback: number): number | null {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
  }

  private parseOptionalInteger(value: unknown, min: number, max: number): number | undefined | null {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
  }
}

export default new PumpologiaRoutes();
