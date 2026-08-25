import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface PumpologiaMarket {
  symbol: string;
  status: string;
}

export interface PumpologiaPosition {
  position_id: string;
  txid: string;
  market: string;
  side: 'long' | 'short';
  status: string;
  margin_sats: string;
  leverage: number;
  notional_sats: string;
  open_height: number;
  close_height: number | null;
  entry_price_usd: number | null;
  mark_price_usd: number | null;
  exit_price_usd: number | null;
  liquidation_price_usd: number | null;
  take_profit_price_usd: number | null;
  stop_loss_price_usd: number | null;
  take_profit_bps: number;
  stop_loss_bps: number;
  pnl_usd: string | null;
  pnl_kind: 'unrealized' | 'realized' | 'none';
  return_bps: number | null;
  outcome: string | null;
  close_reason: string | null;
}

export interface PumpologiaOperation {
  txid: string | null;
  block_height: number;
  type: string;
  status: string;
  position_id: string | null;
  market: string;
  side: 'long' | 'short' | '';
  trade_status: string;
  margin_sats: string;
  leverage: number;
  notional_sats: string;
  entry_price_usd: number | null;
  mark_price_usd: number | null;
  exit_price_usd: number | null;
  pnl_usd: string | null;
  pnl_kind: 'unrealized' | 'realized' | 'none';
  return_bps: number | null;
  outcome: string | null;
}

export interface PumpologiaLeaderboardEntry {
  rank: number;
  trader: string;
  pnl_usd: string | null;
  pnl_sats: string;
  average_return_bps: number;
  trades: number;
  wins: number;
  losses: number;
  last_trade_height: number;
}

export interface PumpologiaSummary {
  as_of: {
    block_height: number;
    block_hash: string;
    indexed_operations: number;
  };
  mark_price_usd: number | null;
  markets: PumpologiaMarket[];
  positions: {
    total: number;
    open: number;
    closed: number;
    liquidated: number;
    expired: number;
    open_interest_sats: string;
    open_interest_long_sats: string;
    open_interest_short_sats: string;
    total_notional_sats: string;
    open_margin_sats: string;
  };
  traders: number;
  top_traders: PumpologiaLeaderboardEntry[];
  recent_activity: PumpologiaOperation[];
}

export interface PumpologiaChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PumpologiaChartReference {
  time: number;
  value: number;
}

export interface PumpologiaBtcChartResponse {
  timeframe: '1h' | '4h' | '1d' | '1w';
  as_of_height: number;
  mark_price_usd: number | null;
  candles: PumpologiaChartCandle[];
  reference: PumpologiaChartReference[];
}

export interface PumpologiaPositionsResponse {
  items: PumpologiaPosition[];
  total: number;
  limit: number;
  offset: number;
}

export interface PumpologiaOperationsResponse {
  items: PumpologiaOperation[];
  limit: number;
  offset: number;
  has_more: boolean;
  as_of_height: number;
}

export interface PumpologiaBlockMarketPoint {
  height: number;
  indexed_height: number;
  price_usd: number | null;
  price_change_usd: number | null;
  open_interest_sats: string;
}

export interface PumpologiaBlockMarketResponse {
  as_of_height: number;
  blocks: PumpologiaBlockMarketPoint[];
}

export interface PumpologiaOperationDetail {
  txid: string;
  items: PumpologiaOperation[];
}

export interface PumpologiaLeaderboardResponse {
  as_of_height: number;
  items: PumpologiaLeaderboardEntry[];
  total: number;
  period: string;
  limit: number;
  offset: number;
}

@Injectable({ providedIn: 'root' })
export class PumpologiaApiService {
  private readonly baseUrl = '/api/pumpologia/v1';

  constructor(private http: HttpClient) {}

  getSummary$(): Observable<PumpologiaSummary> {
    return this.http.get<PumpologiaSummary>(`${this.baseUrl}/summary`);
  }

  getBtcChart$(timeframe: PumpologiaBtcChartResponse['timeframe'], limit = 168): Observable<PumpologiaBtcChartResponse> {
    return this.http.get<PumpologiaBtcChartResponse>(`${this.baseUrl}/btc-chart`, {
      params: this.toParams({ timeframe, limit }),
    });
  }

  getBlockMarket$(heights: number[]): Observable<PumpologiaBlockMarketResponse> {
    return this.http.get<PumpologiaBlockMarketResponse>(`${this.baseUrl}/block-market`, {
      params: this.toParams({ heights: heights.join(',') }),
    });
  }

  getPositions$(filters: Record<string, string | number> = {}): Observable<PumpologiaPositionsResponse> {
    return this.http.get<PumpologiaPositionsResponse>(`${this.baseUrl}/positions`, { params: this.toParams(filters) });
  }

  getPosition$(positionId: string): Observable<PumpologiaPosition> {
    return this.http.get<PumpologiaPosition>(`${this.baseUrl}/positions/${encodeURIComponent(positionId)}`);
  }

  getLeaderboard$(period = 'all', limit = 12, offset = 0): Observable<PumpologiaLeaderboardResponse> {
    return this.http.get<PumpologiaLeaderboardResponse>(`${this.baseUrl}/leaderboard`, {
      params: this.toParams({ period, limit, offset }),
    });
  }

  getOperations$(limit = 25, operationFilters: Record<string, string | number> = {}): Observable<PumpologiaOperationsResponse> {
    return this.http.get<PumpologiaOperationsResponse>(`${this.baseUrl}/operations`, {
      params: this.toParams({ limit, ...operationFilters }),
    });
  }

  getOperation$(txid: string): Observable<PumpologiaOperationDetail> {
    return this.http.get<PumpologiaOperationDetail>(`${this.baseUrl}/operations/${encodeURIComponent(txid)}`);
  }

  private toParams(filters: Record<string, string | number>): HttpParams {
    return Object.entries(filters).reduce(
      (params, [key, value]) => params.set(key, String(value)),
      new HttpParams(),
    );
  }
}
