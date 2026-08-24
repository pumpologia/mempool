import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  PumpologiaApiService,
  PumpologiaLeaderboardResponse,
  PumpologiaOperationsResponse,
  PumpologiaPositionsResponse,
  PumpologiaSummary,
} from '@app/services/pumpologia-api.service';
import { SeoService } from '@app/services/seo.service';
import { BehaviorSubject, Observable, Subject, of, timer } from 'rxjs';
import { catchError, shareReplay, switchMap, takeUntil } from 'rxjs/operators';

type DetailKind = 'overview' | 'token' | 'ticker' | 'position' | 'account' | 'operation' | 'oracle';

@Component({
  selector: 'app-pumpologia-explorer',
  templateUrl: './pumpologia-explorer.component.html',
  styleUrls: ['./pumpologia-explorer.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PumpologiaExplorerComponent implements OnInit, OnDestroy {
  readonly detailKind = (this.route.snapshot.data.kind || 'overview') as DetailKind;
  readonly detailId = this.getDetailId();
  readonly initialSection = this.route.snapshot.data.section as string | undefined;
  readonly limit = 50;
  readonly stateOptions = ['', 'OPEN', 'CLOSED', 'LIQUIDATED', 'EXPIRED'];
  readonly directionOptions = ['', 'long', 'short'];

  apiError = false;
  positionState = this.route.snapshot.queryParamMap.get('state') || '';
  positionDirection = '';
  positionOffset = 0;
  leaderboardPeriod = 'all';

  private readonly destroy$ = new Subject<void>();
  private readonly positionFilters$ = new BehaviorSubject<Record<string, string | number>>(this.makePositionFilters());
  private readonly leaderboardPeriod$ = new BehaviorSubject<string>('all');

  readonly summary$: Observable<PumpologiaSummary | null> = timer(0, 15_000).pipe(
    switchMap(() => this.pumpologiaApi.getSummary$().pipe(
      catchError(() => {
        this.apiError = true;
        return of(null);
      }),
    )),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly positions$: Observable<PumpologiaPositionsResponse | null> = this.positionFilters$.pipe(
    switchMap(filters => this.pumpologiaApi.getPositions$(filters).pipe(catchError(() => of(null)))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly leaderboard$: Observable<PumpologiaLeaderboardResponse | null> = this.leaderboardPeriod$.pipe(
    switchMap(period => this.pumpologiaApi.getLeaderboard$(period).pipe(catchError(() => of(null)))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly operations$: Observable<PumpologiaOperationsResponse | null> = this.pumpologiaApi.getOperations$(50).pipe(
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly detail$: Observable<Record<string, unknown> | null> = this.loadDetail();

  constructor(
    private route: ActivatedRoute,
    private pumpologiaApi: PumpologiaApiService,
    private seoService: SeoService,
  ) {}

  ngOnInit(): void {
    const pageName = this.detailKind === 'overview' ? 'Pumpologia Protocol' : `Pumpologia ${this.capitalize(this.detailKind)}`;
    this.seoService.setTitle(pageName);
    this.seoService.setDescription('Inspect Pumpologia protocol state and trace every indexed event back to Bitcoin.');
    this.summary$.pipe(takeUntil(this.destroy$)).subscribe();
    if (this.initialSection) {
      setTimeout(() => document.getElementById(this.initialSection)?.scrollIntoView({ block: 'start' }), 150);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setPositionState(value: string): void {
    this.positionState = value;
    this.positionOffset = 0;
    this.positionFilters$.next(this.makePositionFilters());
  }

  setPositionDirection(value: string): void {
    this.positionDirection = value;
    this.positionOffset = 0;
    this.positionFilters$.next(this.makePositionFilters());
  }

  changePositionPage(delta: number): void {
    this.positionOffset = Math.max(0, this.positionOffset + (delta * this.limit));
    this.positionFilters$.next(this.makePositionFilters());
  }

  setLeaderboardPeriod(value: string): void {
    this.leaderboardPeriod = value;
    this.leaderboardPeriod$.next(value);
  }

  shortHash(value?: string, leading = 8, trailing = 6): string {
    if (!value) {
      return '—';
    }
    if (value.length <= leading + trailing + 1) {
      return value;
    }
    return `${value.slice(0, leading)}…${value.slice(-trailing)}`;
  }

  formatAtoms(value?: string): string {
    const amount = Number(value || 0) / 100_000_000;
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(amount);
  }

  formatSats(value?: string | number): string {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  formatReturn(value?: string): string {
    return `${(Number(value || 0) / 100).toFixed(2)}%`;
  }

  objectEntries(value: Record<string, unknown> | null): Array<{ key: string; value: unknown }> {
    if (!value) {
      return [];
    }
    return Object.entries(value).map(([key, entryValue]) => ({ key, value: entryValue }));
  }

  isPrimitive(value: unknown): boolean {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value);
  }

  private makePositionFilters(): Record<string, string | number> {
    const filters: Record<string, string | number> = { limit: this.limit, offset: this.positionOffset };
    if (this.positionState) {
      filters.state = this.positionState;
    }
    if (this.positionDirection) {
      filters.direction = this.positionDirection;
    }
    return filters;
  }

  private getDetailId(): string {
    const params = this.route.snapshot.paramMap;
    return params.get('tokenId')
      || params.get('tick')
      || params.get('positionId')
      || params.get('ownerScriptHash')
      || params.get('txid')
      || params.get('height')
      || '';
  }

  private loadDetail(): Observable<Record<string, unknown> | null> {
    let request$: Observable<Record<string, unknown>>;
    switch (this.detailKind) {
      case 'token':
        request$ = this.pumpologiaApi.getToken$(this.detailId);
        break;
      case 'ticker':
        request$ = this.pumpologiaApi.getTicker$(this.detailId);
        break;
      case 'position':
        request$ = this.pumpologiaApi.getPosition$(this.detailId);
        break;
      case 'account':
        request$ = this.pumpologiaApi.getAccount$(this.detailId);
        break;
      case 'operation':
        request$ = this.pumpologiaApi.getOperation$(this.detailId);
        break;
      case 'oracle':
        request$ = this.pumpologiaApi.getOraclePrice$(this.detailId);
        break;
      default:
        return of(null);
    }
    return request$.pipe(catchError(() => of(null)), shareReplay({ bufferSize: 1, refCount: true }));
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
