import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { StateService } from '@app/services/state.service';
import { Transaction, Vout } from '@interfaces/electrs.interface';
import { Observable, Subscription, catchError, combineLatest, map, of, shareReplay, startWith, switchMap, tap } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { ElectrsApiService } from '@app/services/electrs-api.service';

const BLOCK_TRANSACTIONS_PAGE_SIZE = 10;

@Component({
  selector: 'app-block-transactions',
  templateUrl: './block-transactions.component.html',
  styleUrl: './block-transactions.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockTransactionsComponent implements OnInit, OnDestroy {
  @Input() txCount: number;
  @Input() timestamp: number;
  @Input() blockHash: string;
  @Input() previousBlockHash: string;
  @Input() block$: Observable<any>;
  @Input() paginationMaxSize: number;
  @Output() blockReward = new EventEmitter<number>();

  readonly itemsPerPage = BLOCK_TRANSACTIONS_PAGE_SIZE;
  page = 1;

  transactions$: Observable<Transaction[]>;
  isLoadingTransactions = true;
  transactionsError: any = null;
  txsLoadingStatus$: Observable<number>;
  private pageCache = new Map<string, Observable<Transaction[]>>();
  private prefetchSubscription?: Subscription;
  private cachedBlockId?: string;

  constructor(
    private stateService: StateService,
    private route: ActivatedRoute,
    private router: Router,
    private electrsApiService: ElectrsApiService,
  ) { }

  ngOnInit(): void {
    this.transactions$ = combineLatest([this.block$, this.route.queryParams]).pipe(
      tap(([_, queryParams]) => {
        this.page = +queryParams['page'] || 1;
        this.transactionsError = null;
      }),
      switchMap(([block, _]) => {
        if (this.cachedBlockId !== block.id) {
          this.prefetchSubscription?.unsubscribe();
          this.pageCache.clear();
          this.cachedBlockId = block.id;
        }

        const startingIndex = (this.page - 1) * this.itemsPerPage;
        return this.getPage$(block.id, startingIndex).pipe(
          tap(() => this.prefetchNextPage(block.id, startingIndex, block.tx_count)),
          startWith(null),
          catchError((err) => {
            this.transactionsError = err;
            return of([]);
          }),
        );
      }),
      tap((transactions: Transaction[]) => {
        // The block API doesn't contain the block rewards on Liquid
        if (this.stateService.isLiquid() && transactions && transactions[0] && transactions[0].vin[0].is_coinbase) {
          const blockReward = transactions[0].vout.reduce((acc: number, curr: Vout) => acc + curr.value, 0) / 100000000;
          this.blockReward.emit(blockReward);
        }
      })
    );

    this.txsLoadingStatus$ = this.route.paramMap
      .pipe(
        switchMap(() => this.stateService.loadingIndicators$),
        map((indicators) => indicators['blocktxs-' + this.blockHash] !== undefined ? indicators['blocktxs-' + this.blockHash] : 0)
      );
  }

  pageChange(page: number, target: HTMLElement): void {
    target.scrollIntoView(); // works for chrome
    this.router.navigate([], { queryParams: { page: page }, queryParamsHandling: 'merge' });
  }

  ngOnDestroy(): void {
    this.prefetchSubscription?.unsubscribe();
    this.pageCache.clear();
  }

  private getPage$(blockId: string, startingIndex: number): Observable<Transaction[]> {
    const cacheKey = `${blockId}:${startingIndex}`;
    let page$ = this.pageCache.get(cacheKey);
    if (!page$) {
      page$ = this.electrsApiService.getBlockTransactions$(blockId, startingIndex).pipe(
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.pageCache.set(cacheKey, page$);
    }
    return page$;
  }

  private prefetchNextPage(blockId: string, startingIndex: number, txCount: number): void {
    const nextIndex = startingIndex + this.itemsPerPage;
    if (nextIndex >= txCount || this.pageCache.has(`${blockId}:${nextIndex}`)) {
      return;
    }

    this.prefetchSubscription?.unsubscribe();
    this.prefetchSubscription = this.getPage$(blockId, nextIndex).pipe(
      catchError(() => of([])),
    ).subscribe();
  }
}
