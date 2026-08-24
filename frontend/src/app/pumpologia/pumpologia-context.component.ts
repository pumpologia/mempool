import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  PumpologiaApiService,
  PumpologiaOperation,
} from '@app/services/pumpologia-api.service';
import { Subject, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-pumpologia-context',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './pumpologia-context.component.html',
  styleUrls: ['./pumpologia-context.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PumpologiaContextComponent implements OnChanges, OnDestroy {
  @Input() txid?: string;
  @Input() blockHeight?: number;
  @Input() ownerScriptHash?: string;

  operations: PumpologiaOperation[] = [];
  account?: {
    owner_script_hash: string;
    accounts: Array<{
      tick_canonical?: string;
      balance_atoms?: string;
      available_atoms?: string;
      locked_atoms?: string;
    }>;
  };
  private readonly requestChanged$ = new Subject<void>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private pumpologiaApi: PumpologiaApiService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnChanges(): void {
    this.requestChanged$.next();
    this.operations = [];
    this.account = undefined;

    if (this.txid && /^[a-f0-9]{64}$/i.test(this.txid)) {
      this.pumpologiaApi.getOperation$(this.txid).pipe(
        catchError(() => of(null)),
        takeUntil(this.requestChanged$),
        takeUntil(this.destroy$),
      ).subscribe(operation => {
        this.operations = operation ? [operation as unknown as PumpologiaOperation] : [];
        this.cd.markForCheck();
      });
      return;
    }

    if (this.ownerScriptHash && /^[a-f0-9]{64}$/i.test(this.ownerScriptHash)) {
      this.pumpologiaApi.getAccount$(this.ownerScriptHash).pipe(
        catchError(() => of(null)),
        takeUntil(this.requestChanged$),
        takeUntil(this.destroy$),
      ).subscribe(account => {
        const typedAccount = account as unknown as typeof this.account;
        this.account = typedAccount?.accounts?.length ? typedAccount : undefined;
        this.cd.markForCheck();
      });
      return;
    }

    if (Number.isSafeInteger(this.blockHeight) && (this.blockHeight as number) >= 0) {
      this.pumpologiaApi.getOperations$(200, undefined, { block_height: this.blockHeight as number }).pipe(
        catchError(() => of({ items: [] })),
        takeUntil(this.requestChanged$),
        takeUntil(this.destroy$),
      ).subscribe(response => {
        this.operations = response.items;
        this.cd.markForCheck();
      });
    }
  }

  ngOnDestroy(): void {
    this.requestChanged$.next();
    this.requestChanged$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  shortHash(value?: string): string {
    return value && value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value || '—';
  }

  formatAtoms(value?: string): string {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(Number(value || 0) / 100_000_000);
  }
}
