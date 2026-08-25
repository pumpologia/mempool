import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  PumpologiaApiService,
  PumpologiaPositionsResponse,
} from '@app/services/pumpologia-api.service';
import { Observable, of, timer } from 'rxjs';
import { catchError, shareReplay, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-pumpologia-positions-widget',
  templateUrl: './pumpologia-positions-widget.component.html',
  styleUrls: ['./pumpologia-positions-widget.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PumpologiaPositionsWidgetComponent {
  readonly positions$: Observable<PumpologiaPositionsResponse | null> = timer(0, 15_000).pipe(
    switchMap(() => this.pumpologiaApi.getPositions$({ state: 'OPEN', limit: 6 }).pipe(
      catchError(() => of(null)),
    )),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor(private pumpologiaApi: PumpologiaApiService) {}

  formatUsd(value: string | number | null): string {
    if (value === null || value === undefined || value === '') return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
  }

  formatSatsAsUsd(value: string, price: number | null): string {
    if (price === null || !Number.isFinite(price)) return '—';
    return this.formatUsd((Number(value || 0) / 100_000_000) * price);
  }

  valuationPrice(position: PumpologiaPositionsResponse['items'][number]): number | null {
    return position.exit_price_usd ?? position.mark_price_usd ?? position.entry_price_usd;
  }

  pnlClass(value: string | null): string {
    const amount = Number(value || 0);
    return amount > 0 ? 'positive' : amount < 0 ? 'negative' : '';
  }
}
