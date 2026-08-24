import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
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
  @Output() matchChange = new EventEmitter<boolean>();

  operations: PumpologiaOperation[] = [];
  private readonly requestChanged$ = new Subject<void>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private pumpologiaApi: PumpologiaApiService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnChanges(): void {
    this.requestChanged$.next();
    this.operations = [];

    if (this.txid && /^[a-f0-9]{64}$/i.test(this.txid)) {
      this.pumpologiaApi.getOperation$(this.txid).pipe(
        catchError(() => of(null)),
        takeUntil(this.requestChanged$),
        takeUntil(this.destroy$),
      ).subscribe(operation => {
        this.operations = Array.isArray(operation?.items) ? operation.items : [];
        this.matchChange.emit(this.operations.length > 0);
        this.cd.markForCheck();
      });
      return;
    }

    if (Number.isSafeInteger(this.blockHeight) && (this.blockHeight as number) >= 0) {
      this.pumpologiaApi.getOperations$(25, { block_height: this.blockHeight as number }).pipe(
        catchError(() => of({ items: [] })),
        takeUntil(this.requestChanged$),
        takeUntil(this.destroy$),
      ).subscribe(response => {
        this.operations = response.items;
        this.matchChange.emit(this.operations.length > 0);
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

  formatSats(value?: string | number | null): string {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  formatUsd(value?: string | number | null): string {
    if (value === null || value === undefined || value === '') return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Number(value));
  }

  pnlClass(value?: string | null): string {
    const numeric = Number(value || 0);
    return numeric > 0 ? 'positive' : numeric < 0 ? 'negative' : '';
  }
}
