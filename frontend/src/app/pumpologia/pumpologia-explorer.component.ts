import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  PumpologiaApiService,
  PumpologiaLeaderboardResponse,
  PumpologiaOperation,
  PumpologiaPositionsResponse,
  PumpologiaPosition,
  PumpologiaSummary,
} from '@app/services/pumpologia-api.service';
import { SeoService } from '@app/services/seo.service';
import { BehaviorSubject, Observable, Subject, of, timer } from 'rxjs';
import { catchError, shareReplay, switchMap, takeUntil } from 'rxjs/operators';

type PageKind = 'overview' | 'position';

@Component({
  selector: 'app-pumpologia-explorer',
  templateUrl: './pumpologia-explorer.component.html',
  styleUrls: ['./pumpologia-explorer.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PumpologiaExplorerComponent implements OnInit, OnDestroy {
  readonly pageKind = (this.route.snapshot.data.kind || 'overview') as PageKind;
  readonly positionId = this.route.snapshot.paramMap.get('positionId') || '';
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

  readonly position$: Observable<PumpologiaPosition | null> = this.pageKind === 'position'
    ? this.pumpologiaApi.getPosition$(this.positionId).pipe(
      catchError(() => of(null)),
      shareReplay({ bufferSize: 1, refCount: true }),
    )
    : of(null);

  constructor(
    private route: ActivatedRoute,
    private pumpologiaApi: PumpologiaApiService,
    private seoService: SeoService,
  ) {}

  ngOnInit(): void {
    this.seoService.setTitle(this.pageKind === 'position' ? 'Pumpologia Position' : 'Pumpologia Trading Terminal');
    this.seoService.setDescription('Track Pumpologia perpetual positions, leverage, margin, notional exposure and P&L anchored to Bitcoin.');
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

  shortHash(value?: string | null, leading = 8, trailing = 6): string {
    if (!value) return '—';
    if (value.length <= leading + trailing + 1) return value;
    return `${value.slice(0, leading)}…${value.slice(-trailing)}`;
  }

  formatSats(value?: string | number | null): string {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  formatUsd(value?: string | number | null): string {
    if (value === null || value === undefined || value === '') return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
  }

  formatReturn(value?: number | null): string {
    if (value === null || value === undefined) return '—';
    return `${(value / 100).toFixed(2)}%`;
  }

  pnlClass(value?: string | null): string {
    const numeric = Number(value || 0);
    return numeric > 0 ? 'positive' : numeric < 0 ? 'negative' : '';
  }

  operationLabel(operation: PumpologiaOperation): string {
    if (operation.side) return `${operation.side.toUpperCase()} ${operation.market}`;
    return operation.type;
  }

  private makePositionFilters(): Record<string, string | number> {
    const filters: Record<string, string | number> = { limit: this.limit, offset: this.positionOffset };
    if (this.positionState) filters.state = this.positionState;
    if (this.positionDirection) filters.direction = this.positionDirection;
    return filters;
  }
}
