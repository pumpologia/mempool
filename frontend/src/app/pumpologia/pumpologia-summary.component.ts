import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PumpologiaApiService, PumpologiaSummary } from '@app/services/pumpologia-api.service';
import { Observable, of, timer } from 'rxjs';
import { catchError, shareReplay, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-pumpologia-summary',
  templateUrl: './pumpologia-summary.component.html',
  styleUrls: ['./pumpologia-summary.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PumpologiaSummaryComponent {
  readonly summary$: Observable<PumpologiaSummary | null> = timer(0, 15_000).pipe(
    switchMap(() => this.pumpologiaApi.getSummary$().pipe(catchError(() => of(null)))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor(private pumpologiaApi: PumpologiaApiService) {}

  getOpenPositions(summary: PumpologiaSummary): number {
    return summary.positions.open || 0;
  }

  formatSatsAsUsd(value: string, price: number | null): string {
    if (price === null || !Number.isFinite(price)) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format((Number(value || 0) / 100_000_000) * price);
  }
}
