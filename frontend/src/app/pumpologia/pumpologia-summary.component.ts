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
    return summary.position_counts.by_state.OPEN || 0;
  }

  getSupply(summary: PumpologiaSummary): string {
    const atoms = Number(summary.tokens[0]?.net_supply_atoms || 0);
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(atoms / 100_000_000);
  }
}
