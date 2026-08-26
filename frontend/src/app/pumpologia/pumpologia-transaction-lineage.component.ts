import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconName } from '@fortawesome/fontawesome-common-types';
import { Outspend, Transaction, Vin, Vout } from '@interfaces/electrs.interface';
import { ElectrsApiService } from '@app/services/electrs-api.service';
import {
  PumpologiaApiService,
  PumpologiaOperation,
  PumpologiaPosition,
} from '@app/services/pumpologia-api.service';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import {
  pumpologiaEventIcon,
  pumpologiaEventKind,
  pumpologiaEventLabel,
  PumpologiaEventKind,
} from './pumpologia-event.utils';

@Component({
  selector: 'app-pumpologia-transaction-lineage',
  standalone: true,
  imports: [CommonModule, RouterModule, FontAwesomeModule],
  templateUrl: './pumpologia-transaction-lineage.component.html',
  styleUrls: ['./pumpologia-transaction-lineage.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PumpologiaTransactionLineageComponent implements OnChanges, OnDestroy {
  @Input() transaction?: Transaction | null;
  @Input() operations: PumpologiaOperation[] = [];

  positions: PumpologiaPosition[] = [];
  outspends: Outspend[] = [];
  isLoading = false;
  readonly maxBranches = 7;
  private readonly requestChanged$ = new Subject<void>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private pumpologiaApi: PumpologiaApiService,
    private electrsApi: ElectrsApiService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnChanges(): void {
    this.requestChanged$.next();
    this.positions = [];
    this.outspends = [];

    if (!this.transaction || !this.operations.length) {
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    const positionIds = Array.from(new Set(
      this.operations.map(operation => operation.position_id).filter((id): id is string => !!id),
    ));
    const positions$ = positionIds.length
      ? forkJoin(positionIds.map(positionId => this.pumpologiaApi.getPosition$(positionId).pipe(catchError(() => of(null)))))
      : of([] as Array<PumpologiaPosition | null>);

    forkJoin({
      positions: positions$,
      outspends: this.electrsApi.getOutspends$(this.transaction.txid).pipe(catchError(() => of([] as Outspend[]))),
    }).pipe(
      takeUntil(this.requestChanged$),
      takeUntil(this.destroy$),
    ).subscribe(({ positions, outspends }) => {
      this.positions = positions.filter((position): position is PumpologiaPosition => !!position);
      this.outspends = outspends;
      this.isLoading = false;
      this.cd.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.requestChanged$.next();
    this.requestChanged$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get primaryOperation(): PumpologiaOperation | null {
    return this.operations[0] || null;
  }

  get primaryPosition(): PumpologiaPosition | null {
    return this.positions[0] || null;
  }

  get visibleInputs(): Vin[] {
    return (this.transaction?.vin || []).slice(0, this.maxBranches);
  }

  get visibleOutputs(): Vout[] {
    return (this.transaction?.vout || []).slice(0, this.maxBranches);
  }

  get canvasHeight(): number {
    return Math.max(470, Math.max(this.visibleInputs.length, this.visibleOutputs.length) * 96 + 112);
  }

  get centerY(): number {
    return this.canvasHeight / 2;
  }

  eventKind(): PumpologiaEventKind {
    return this.primaryOperation ? pumpologiaEventKind(this.primaryOperation) : 'event';
  }

  eventIcon(): IconName {
    return this.primaryOperation ? pumpologiaEventIcon(this.primaryOperation) : 'timeline';
  }

  eventLabel(): string {
    return this.primaryOperation ? pumpologiaEventLabel(this.primaryOperation) : 'Protocol event';
  }

  branchY(index: number, count: number): number {
    if (count <= 1) {
      return this.centerY;
    }
    const padding = 54;
    return padding + (index * ((this.canvasHeight - (padding * 2)) / (count - 1)));
  }

  inputPath(index: number): string {
    const y = this.branchY(index, this.visibleInputs.length);
    return `M 312 ${y} C 372 ${y}, 420 ${this.centerY}, 456 ${this.centerY}`;
  }

  outputPath(index: number): string {
    const y = this.branchY(index, this.visibleOutputs.length);
    return `M 744 ${this.centerY} C 780 ${this.centerY}, 828 ${y}, 888 ${y}`;
  }

  isPositionInput(input: Vin): boolean {
    return this.positions.some(position => position.txid === input.txid
      && (position.open_vout ?? Number(position.position_id.split(':')[1])) === input.vout);
  }

  isPositionOutput(outputIndex: number): boolean {
    return this.positions.some(position => position.txid === this.transaction?.txid
      && (position.open_vout ?? Number(position.position_id.split(':')[1])) === outputIndex);
  }

  inputRole(input: Vin): string {
    return this.isPositionInput(input) ? 'Position UTXO' : 'Funding input';
  }

  outputRole(output: Vout, outputIndex: number): string {
    if (output.scriptpubkey_type === 'op_return') {
      return 'Protocol instruction';
    }
    if (this.isPositionOutput(outputIndex)) {
      return 'Position UTXO';
    }
    if (this.eventKind() === 'close' || this.eventKind() === 'liquidation'
      || this.eventKind() === 'take-profit' || this.eventKind() === 'stop-loss') {
      return 'Settlement output';
    }
    return this.outspends[outputIndex]?.spent ? 'Spent output' : 'Available output';
  }

  outputLink(outputIndex: number): string[] | null {
    const spend = this.outspends[outputIndex];
    return spend?.spent && spend.txid ? ['/tx', spend.txid] : null;
  }

  isCurrentTx(txid?: string | null): boolean {
    return !!txid && txid === this.transaction?.txid;
  }

  shortHash(value?: string | null): string {
    return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : 'Indexer settlement';
  }

  formatBtc(value?: number | null): string {
    if (value === null || value === undefined) {
      return 'Value unavailable';
    }
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value / 100_000_000)} BTC`;
  }

  formatUsd(value?: string | number | null): string {
    if (value === null || value === undefined || value === '') {
      return 'Pending';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Number(value));
  }

  pnlClass(value?: string | null): string {
    const numeric = Number(value || 0);
    return numeric > 0 ? 'positive' : numeric < 0 ? 'negative' : 'neutral';
  }
}
