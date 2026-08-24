import axios, { isAxiosError } from 'axios';
import { Application, Request, Response } from 'express';
import logger from '../../logger';

const API_PREFIX = '/api/pumpologia/v1';
const HASH_REGEX = /^[a-f0-9]{64}$/i;
const POSITION_REGEX = /^[a-f0-9]{64}:\d+$/i;
const TICK_REGEX = /^[a-z0-9]{1,32}$/i;
const STATE_REGEX = /^[a-z_]{1,32}$/i;
const DIRECTION_REGEX = /^(long|short)$/i;
const CURSOR_REGEX = /^[A-Za-z0-9._-]{1,1024}$/;
const INDEXER_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const CACHE_TTL_MS = 10_000;

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

interface PositionRecord {
  tick_canonical?: string;
  state?: string;
  direction?: string;
  owner_script_hash?: string;
  [key: string]: unknown;
}

interface OperationRecord {
  block_height?: number;
  op?: string;
  status?: string;
  tick_canonical?: string;
  [key: string]: unknown;
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

    app
      .get(`${API_PREFIX}/summary`, this.$getSummary.bind(this))
      .get(`${API_PREFIX}/health`, this.proxy('health', 5))
      .get(`${API_PREFIX}/sync`, this.proxy('sync', 5))
      .get(`${API_PREFIX}/tokens`, this.proxy('tokens', 15))
      .get(`${API_PREFIX}/tokens/:tokenId`, this.$getToken.bind(this))
      .get(`${API_PREFIX}/tokens/:tokenId/mint-history`, this.$getMintHistory.bind(this))
      .get(`${API_PREFIX}/tickers/:tick`, this.$getTicker.bind(this))
      .get(`${API_PREFIX}/positions`, this.$getPositions.bind(this))
      .get(`${API_PREFIX}/positions/:positionId`, this.$getPosition.bind(this))
      .get(`${API_PREFIX}/leaderboard`, this.$getLeaderboard.bind(this))
      .get(`${API_PREFIX}/accounts/:ownerScriptHash`, this.$getAccount.bind(this))
      .get(`${API_PREFIX}/accounts/:ownerScriptHash/history`, this.$getAccountHistory.bind(this))
      .get(`${API_PREFIX}/oracle/prices/:height`, this.$getOraclePrice.bind(this))
      .get(`${API_PREFIX}/operations`, this.$getOperations.bind(this))
      .get(`${API_PREFIX}/operations/:txid`, this.$getOperation.bind(this));

    logger.notice(`Pumpologia public API gateway enabled for ${this.indexerUrl}`, this.tag);
  }

  private proxy(path: string, maxAgeSeconds = 10): (req: Request, res: Response) => Promise<void> {
    return async (_req: Request, res: Response): Promise<void> => {
      await this.sendIndexerResponse(res, path, {}, maxAgeSeconds);
    };
  }

  private async $getSummary(_req: Request, res: Response): Promise<void> {
    try {
      const cacheKey = 'summary';
      const cached = this.getCached(cacheKey);
      if (cached) {
        this.sendJson(res, cached, 10);
        return;
      }

      const [sync, tokens, positions, leaderboard, operations] = await Promise.all([
        this.getIndexer('sync'),
        this.getIndexer('tokens'),
        this.getIndexer('positions'),
        this.getIndexer('leaderboard'),
        this.getIndexer('operations', { limit: 12 }),
      ]);
      const positionItems = Array.isArray(positions) ? positions as PositionRecord[] : [];
      const positionStates = positionItems.reduce<Record<string, number>>((counts, position) => {
        const state = String(position.state || 'UNKNOWN').toUpperCase();
        counts[state] = (counts[state] || 0) + 1;
        return counts;
      }, {});
      const data = {
        generated_at: new Date().toISOString(),
        protocol_version: 'pumpologia-v1',
        sync,
        tokens: Array.isArray(tokens) ? tokens : [],
        position_counts: {
          total: positionItems.length,
          by_state: positionStates,
        },
        leaderboard: {
          ...((leaderboard && typeof leaderboard === 'object') ? leaderboard as object : {}),
          items: Array.isArray((leaderboard as { items?: unknown[] })?.items)
            ? (leaderboard as { items: unknown[] }).items.slice(0, 10)
            : [],
        },
        operations: Array.isArray((operations as { items?: unknown[] })?.items)
          ? (operations as { items: unknown[] }).items
          : [],
      };
      this.setCached(cacheKey, data);
      this.sendJson(res, data, 10);
    } catch (error) {
      this.sendUpstreamError(res, error, 'summary');
    }
  }

  private async $getToken(req: Request, res: Response): Promise<void> {
    if (!HASH_REGEX.test(req.params.tokenId)) {
      this.sendValidationError(res, 'invalid token id');
      return;
    }
    await this.sendIndexerResponse(res, `tokens/${req.params.tokenId}`, {}, 15);
  }

  private async $getMintHistory(req: Request, res: Response): Promise<void> {
    if (!HASH_REGEX.test(req.params.tokenId)) {
      this.sendValidationError(res, 'invalid token id');
      return;
    }
    const limit = this.parseInteger(req.query.limit, 1, 2000, 100);
    if (limit === null) {
      this.sendValidationError(res, 'limit must be an integer between 1 and 2000');
      return;
    }
    await this.sendIndexerResponse(res, `tokens/${req.params.tokenId}/mint-history`, { limit }, 15);
  }

  private async $getTicker(req: Request, res: Response): Promise<void> {
    if (!TICK_REGEX.test(req.params.tick)) {
      this.sendValidationError(res, 'invalid ticker');
      return;
    }
    await this.sendIndexerResponse(res, `tickers/${encodeURIComponent(req.params.tick.toLowerCase())}`, {}, 15);
  }

  private async $getPositions(req: Request, res: Response): Promise<void> {
    const tick = this.optionalString(req.query.tick, TICK_REGEX);
    const state = this.optionalString(req.query.state, STATE_REGEX);
    const direction = this.optionalString(req.query.direction, DIRECTION_REGEX);
    const ownerScriptHash = this.optionalString(req.query.owner_script_hash, HASH_REGEX);
    const limit = this.parseInteger(req.query.limit, 1, 500, 50);
    const offset = this.parseInteger(req.query.offset, 0, 100_000, 0);
    if (tick === null || state === null || direction === null || ownerScriptHash === null || limit === null || offset === null) {
      this.sendValidationError(res, 'invalid positions filter');
      return;
    }

    try {
      const raw = await this.getIndexer('positions');
      let items = Array.isArray(raw) ? raw as PositionRecord[] : [];
      if (tick) {
        items = items.filter(position => String(position.tick_canonical || '').toLowerCase() === tick.toLowerCase());
      }
      if (state) {
        items = items.filter(position => String(position.state || '').toLowerCase() === state.toLowerCase());
      }
      if (direction) {
        items = items.filter(position => String(position.direction || '').toLowerCase() === direction.toLowerCase());
      }
      if (ownerScriptHash) {
        items = items.filter(position => String(position.owner_script_hash || '').toLowerCase() === ownerScriptHash.toLowerCase());
      }
      this.sendJson(res, {
        items: items.slice(offset, offset + limit),
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
    await this.sendIndexerResponse(res, `positions/${encodeURIComponent(req.params.positionId)}`, {}, 10);
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
    const query: Record<string, string | number> = { limit, offset };
    if (period) {
      query.period = period;
    }
    if (tick) {
      query.tick = tick.toLowerCase();
    }
    await this.sendIndexerResponse(res, 'leaderboard', query, 15);
  }

  private async $getAccount(req: Request, res: Response): Promise<void> {
    if (!HASH_REGEX.test(req.params.ownerScriptHash)) {
      this.sendValidationError(res, 'invalid owner script hash');
      return;
    }
    await this.sendIndexerResponse(res, `accounts/${req.params.ownerScriptHash}`, {}, 10);
  }

  private async $getAccountHistory(req: Request, res: Response): Promise<void> {
    if (!HASH_REGEX.test(req.params.ownerScriptHash)) {
      this.sendValidationError(res, 'invalid owner script hash');
      return;
    }
    const limit = this.parseInteger(req.query.limit, 1, 500, 100);
    if (limit === null) {
      this.sendValidationError(res, 'limit must be an integer between 1 and 500');
      return;
    }
    await this.sendIndexerResponse(res, `accounts/${req.params.ownerScriptHash}/history`, { limit }, 10);
  }

  private async $getOraclePrice(req: Request, res: Response): Promise<void> {
    if (!/^\d{1,9}$/.test(req.params.height)) {
      this.sendValidationError(res, 'invalid block height');
      return;
    }
    await this.sendIndexerResponse(res, `oracle/prices/${req.params.height}`, {}, 30);
  }

  private async $getOperations(req: Request, res: Response): Promise<void> {
    const limit = this.parseInteger(req.query.limit, 1, 100, 50);
    const cursor = this.optionalString(req.query.cursor, CURSOR_REGEX);
    const blockHeight = this.parseOptionalInteger(req.query.block_height, 0, 10_000_000);
    const op = this.optionalString(req.query.op, STATE_REGEX);
    const status = this.optionalString(req.query.status, STATE_REGEX);
    const tick = this.optionalString(req.query.tick, TICK_REGEX);
    if (limit === null || cursor === null || blockHeight === null || op === null || status === null || tick === null) {
      this.sendValidationError(res, 'invalid operations filter');
      return;
    }

    if (blockHeight !== undefined || op || status || tick) {
      if (cursor) {
        this.sendValidationError(res, 'cursor cannot be combined with operation filters');
        return;
      }
      try {
        const items = await this.getFilteredOperations({ blockHeight, op, status, tick }, limit);
        this.sendJson(res, { items }, 10);
      } catch (error) {
        this.sendUpstreamError(res, error, 'operations');
      }
      return;
    }

    const query: Record<string, string | number> = { limit };
    if (cursor) {
      query.cursor = cursor;
    }
    await this.sendIndexerResponse(res, 'operations', query, 10);
  }

  /** @asyncUnsafe */
  private async getFilteredOperations(
    filters: { blockHeight?: number; op?: string; status?: string; tick?: string },
    limit: number,
  ): Promise<OperationRecord[]> {
    const matches: OperationRecord[] = [];
    let cursor: string | undefined;

    // Operations are returned newest first. The bounded walk keeps old-block
    // lookups useful without allowing an unbounded public indexer scan.
    for (let page = 0; page < 40 && matches.length < limit; page++) {
      const query: Record<string, string | number> = { limit: 100 };
      if (cursor) {
        query.cursor = cursor;
      }
      const response = await this.getIndexer('operations', query) as { items?: OperationRecord[]; next_cursor?: string };
      const items = Array.isArray(response?.items) ? response.items : [];

      for (const item of items) {
        if (filters.blockHeight !== undefined && item.block_height !== filters.blockHeight) {
          continue;
        }
        if (filters.op && String(item.op || '').toLowerCase() !== filters.op.toLowerCase()) {
          continue;
        }
        if (filters.status && String(item.status || '').toLowerCase() !== filters.status.toLowerCase()) {
          continue;
        }
        if (filters.tick && String(item.tick_canonical || '').toLowerCase() !== filters.tick.toLowerCase()) {
          continue;
        }
        matches.push(item);
        if (matches.length >= limit) {
          break;
        }
      }

      if (!response?.next_cursor || items.length === 0) {
        break;
      }
      if (filters.blockHeight !== undefined) {
        const heights = items.map(item => item.block_height).filter((height): height is number => typeof height === 'number');
        if (heights.length && Math.min(...heights) < filters.blockHeight) {
          break;
        }
      }
      cursor = response.next_cursor;
    }

    return matches;
  }

  private async $getOperation(req: Request, res: Response): Promise<void> {
    if (!HASH_REGEX.test(req.params.txid)) {
      this.sendValidationError(res, 'invalid transaction id');
      return;
    }
    await this.sendIndexerResponse(res, `operations/${req.params.txid}`, {}, 10);
  }

  /** @asyncSafe */
  private async sendIndexerResponse(
    res: Response,
    path: string,
    params: Record<string, string | number>,
    maxAgeSeconds: number,
  ): Promise<void> {
    try {
      const data = await this.getIndexer(path, params);
      this.sendJson(res, data, maxAgeSeconds);
    } catch (error) {
      this.sendUpstreamError(res, error, path);
    }
  }

  /** @asyncUnsafe */
  private async getIndexer(path: string, params: Record<string, string | number> = {}): Promise<unknown> {
    const cacheKey = `${path}?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString()}`;
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

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
      .setHeader('X-Pumpologia-Source', 'pumpologia-indexer')
      .status(200)
      .json(data);
  }

  private sendUpstreamError(res: Response, error: unknown, path: string): void {
    if (isAxiosError(error) && error.response?.status === 404) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    logger.err(`Pumpologia indexer request failed for ${path}: ${error instanceof Error ? error.message : String(error)}`, this.tag);
    res.status(502).json({ error: 'indexer_unavailable' });
  }

  private sendValidationError(res: Response, message: string): void {
    res.status(400).json({ error: 'invalid_request', message });
  }

  private getCached(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private setCached(key: string, value: unknown): void {
    if (this.cache.size >= 128) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  private optionalString(value: unknown, regex: RegExp): string | undefined | null {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string' || !regex.test(value)) {
      return null;
    }
    return value;
  }

  private parseInteger(value: unknown, min: number, max: number, fallback: number): number | null {
    if (value === undefined) {
      return fallback;
    }
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
  }

  private parseOptionalInteger(value: unknown, min: number, max: number): number | undefined | null {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
  }
}

export default new PumpologiaRoutes();
