import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface PumpologiaToken {
  token_id: string;
  tick_canonical: string;
  max_supply_tokens: string;
  minted_supply_atoms: string;
  net_supply_atoms: string;
  deploy_height: number;
  first_active_height: number;
  state: string;
}

export interface PumpologiaPosition {
  position_id: string;
  token_id: string;
  tick_canonical: string;
  direction: 'long' | 'short';
  owner_script_hash: string;
  amt_sats: number;
  leverage: number;
  notional_sats: string;
  open_height: number;
  entry_price: number;
  state: string;
  close_height?: number;
  outcome?: string;
  terminal_reason?: string;
}

export interface PumpologiaOperation {
  txid?: string;
  block_height: number;
  op: string;
  status: string;
  tick_canonical?: string;
  position_id?: string;
  direction?: string;
  leverage?: number;
  state?: string;
  outcome?: string;
  event_id: string;
}

export interface PumpologiaLeaderboardEntry {
  rank: number;
  owner_script_hash: string;
  pnl_sats: string;
  average_return_bps: string;
  trade_count: number;
  wins: number;
  losses: number;
  last_trade_height: number;
}

export interface PumpologiaSummary {
  generated_at: string;
  protocol_version: string;
  sync: {
    checkpoint_height: number;
    checkpoint_hash: string;
    operation_count: number;
    protocol_version: string;
  };
  tokens: PumpologiaToken[];
  position_counts: {
    total: number;
    by_state: Record<string, number>;
  };
  leaderboard: {
    as_of_height: number;
    items: PumpologiaLeaderboardEntry[];
    total: number;
  };
  operations: PumpologiaOperation[];
}

export interface PumpologiaPositionsResponse {
  items: PumpologiaPosition[];
  total: number;
  limit: number;
  offset: number;
}

export interface PumpologiaOperationsResponse {
  items: PumpologiaOperation[];
  next_cursor?: string;
}

export interface PumpologiaLeaderboardResponse {
  as_of_height: number;
  items: PumpologiaLeaderboardEntry[];
  total: number;
  period: string;
}

@Injectable({ providedIn: 'root' })
export class PumpologiaApiService {
  private readonly baseUrl = '/api/pumpologia/v1';

  constructor(private http: HttpClient) {}

  getSummary$(): Observable<PumpologiaSummary> {
    return this.http.get<PumpologiaSummary>(`${this.baseUrl}/summary`);
  }

  getPositions$(filters: Record<string, string | number> = {}): Observable<PumpologiaPositionsResponse> {
    return this.http.get<PumpologiaPositionsResponse>(`${this.baseUrl}/positions`, {
      params: this.toParams(filters),
    });
  }

  getLeaderboard$(period = 'all', limit = 50): Observable<PumpologiaLeaderboardResponse> {
    return this.http.get<PumpologiaLeaderboardResponse>(`${this.baseUrl}/leaderboard`, {
      params: this.toParams({ period, limit }),
    });
  }

  getOperations$(limit = 50, cursor?: string, operationFilters: Record<string, string | number> = {}): Observable<PumpologiaOperationsResponse> {
    const filters: Record<string, string | number> = { limit, ...operationFilters };
    if (cursor) {
      filters.cursor = cursor;
    }
    return this.http.get<PumpologiaOperationsResponse>(`${this.baseUrl}/operations`, {
      params: this.toParams(filters),
    });
  }

  getToken$(tokenId: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.baseUrl}/tokens/${encodeURIComponent(tokenId)}`);
  }

  getTicker$(tick: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.baseUrl}/tickers/${encodeURIComponent(tick)}`);
  }

  getPosition$(positionId: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.baseUrl}/positions/${encodeURIComponent(positionId)}`);
  }

  getAccount$(ownerScriptHash: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.baseUrl}/accounts/${encodeURIComponent(ownerScriptHash)}`);
  }

  getOperation$(txid: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.baseUrl}/operations/${encodeURIComponent(txid)}`);
  }

  getOraclePrice$(height: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.baseUrl}/oracle/prices/${encodeURIComponent(height)}`);
  }

  private toParams(filters: Record<string, string | number>): HttpParams {
    return Object.entries(filters).reduce(
      (params, [key, value]) => params.set(key, String(value)),
      new HttpParams(),
    );
  }
}
