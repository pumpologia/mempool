import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-pumpologia-summary',
  templateUrl: './pumpologia-summary.component.html',
  styleUrls: ['./pumpologia-summary.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PumpologiaSummaryComponent {}
