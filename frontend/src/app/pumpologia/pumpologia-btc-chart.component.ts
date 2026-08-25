import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, LOCALE_ID, OnDestroy, OnInit } from '@angular/core';
import { EChartsOption } from '@app/graphs/echarts';
import {
  PumpologiaApiService,
  PumpologiaBtcChartResponse,
} from '@app/services/pumpologia-api.service';
import { BehaviorSubject, Subject, combineLatest, of, timer } from 'rxjs';
import { catchError, switchMap, takeUntil } from 'rxjs/operators';

type ChartTimeframe = PumpologiaBtcChartResponse['timeframe'];

@Component({
  selector: 'app-pumpologia-btc-chart',
  templateUrl: './pumpologia-btc-chart.component.html',
  styleUrls: ['./pumpologia-btc-chart.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PumpologiaBtcChartComponent implements OnInit, OnDestroy {
  readonly timeframes: Array<{ value: ChartTimeframe; label: string }> = [
    { value: '1h', label: '1H' },
    { value: '4h', label: '4H' },
    { value: '1d', label: '1D' },
    { value: '1w', label: '1W' },
  ];
  readonly chartInitOptions = { renderer: 'svg' };

  timeframe: ChartTimeframe = '1h';
  snapshot: PumpologiaBtcChartResponse | null = null;
  chartOptions: EChartsOption = {};
  isLoading = true;
  hasError = false;
  changePercent: number | null = null;
  sessionHigh: number | null = null;
  sessionLow: number | null = null;

  private readonly timeframe$ = new BehaviorSubject<ChartTimeframe>('1h');
  private readonly destroy$ = new Subject<void>();

  constructor(
    @Inject(LOCALE_ID) private locale: string,
    private pumpologiaApi: PumpologiaApiService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    combineLatest([this.timeframe$, timer(0, 30_000)]).pipe(
      switchMap(([timeframe]) => this.pumpologiaApi.getBtcChart$(timeframe).pipe(
        catchError(() => of(null)),
      )),
      takeUntil(this.destroy$),
    ).subscribe(snapshot => {
      this.isLoading = false;
      this.hasError = !snapshot || snapshot.candles.length === 0;
      if (snapshot?.candles.length) {
        this.snapshot = snapshot;
        this.mountChart(snapshot);
      }
      this.cd.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectTimeframe(timeframe: ChartTimeframe): void {
    if (timeframe === this.timeframe) return;
    this.timeframe = timeframe;
    this.isLoading = true;
    this.hasError = false;
    this.timeframe$.next(timeframe);
  }

  formatUsd(value?: number | null): string {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat(this.locale, {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0,
    }).format(value);
  }

  formatChange(value?: number | null): string {
    if (value === null || value === undefined) return '—';
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  }

  private mountChart(snapshot: PumpologiaBtcChartResponse): void {
    const candles = snapshot.candles;
    const trailingSlots = Math.max(6, Math.ceil(candles.length * 0.045));
    const categories = [
      ...candles.map(point => String(point.time)),
      ...Array.from({ length: trailingSlots }, () => ''),
    ];
    const referenceByTime = new Map(snapshot.reference.map(point => [point.time, point.value]));
    const firstClose = candles[0].close;
    const lastClose = candles[candles.length - 1].close;
    this.changePercent = firstClose ? ((lastClose - firstClose) / firstClose) * 100 : null;
    this.sessionHigh = Math.max(...candles.map(point => point.high));
    this.sessionLow = Math.min(...candles.map(point => point.low));

    this.chartOptions = {
      animation: false,
      backgroundColor: 'transparent',
      textStyle: {
        color: '#f2f2ed',
        fontFamily: 'Pixel Operator, monospace',
        fontSize: 14,
      },
      grid: { left: 16, right: 58, top: 24, bottom: 42, containLabel: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', lineStyle: { color: '#8c8c87', type: 'dashed' } },
        backgroundColor: '#0d0d0d',
        borderColor: '#494946',
        borderWidth: 1,
        textStyle: { color: '#f2f2ed', fontFamily: 'Pixel Operator, monospace', fontSize: 14 },
        formatter: (items: any[]) => {
          const candleItem = items.find(item => item.seriesName === 'Pumpologia oracle');
          const referenceItem = items.find(item => item.seriesName === 'Market reference');
          if (!candleItem) return '';
          const timestamp = Number(candleItem.axisValue) * 1000;
          const values = candleItem.data as number[];
          const date = new Intl.DateTimeFormat(this.locale, {
            month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
          }).format(timestamp);
          const marketValue = referenceItem?.data;
          return [
            `<strong>${date} UTC</strong>`,
            `Open&nbsp;&nbsp;${this.formatUsd(values[0])}`,
            `High&nbsp;&nbsp;${this.formatUsd(values[3])}`,
            `Low&nbsp;&nbsp;&nbsp;${this.formatUsd(values[2])}`,
            `Close&nbsp;${this.formatUsd(values[1])}`,
            marketValue === null || marketValue === undefined ? '' : `Market&nbsp;${this.formatUsd(Number(marketValue))}`,
          ].filter(Boolean).join('<br>');
        },
      },
      xAxis: {
        type: 'category',
        data: categories,
        boundaryGap: true,
        axisLine: { lineStyle: { color: '#494946' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#b4b4ae',
          fontFamily: 'Pixel Operator, monospace',
          fontSize: 13,
          hideOverlap: true,
          formatter: (value: string) => value ? this.formatAxisLabel(Number(value)) : '',
        },
      },
      yAxis: {
        type: 'value',
        scale: true,
        position: 'right',
        axisLine: { show: true, lineStyle: { color: '#494946' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#b4b4ae',
          fontFamily: 'Pixel Operator, monospace',
          fontSize: 13,
          formatter: (value: number) => `$${Math.round(value / 1000)}k`,
        },
        splitLine: { lineStyle: { color: '#30302e', type: 'dotted' } },
      },
      series: [
        {
          name: 'Pumpologia oracle',
          type: 'candlestick',
          data: candles.map(point => [point.open, point.close, point.low, point.high]),
          itemStyle: {
            color: '#8fb69a',
            color0: '#171219',
            borderColor: '#8fb69a',
            borderColor0: '#bd8c8a',
            borderWidth: 1.5,
          },
        },
        {
          name: 'Market reference',
          type: 'line',
          data: candles.map(point => referenceByTime.get(point.time) ?? null),
          symbol: 'none',
          showSymbol: false,
          connectNulls: false,
          lineStyle: { color: '#8faec9', type: 'dashed', width: 1.5 },
          emphasis: { disabled: true },
        },
      ],
    };
  }

  private formatAxisLabel(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    if (this.timeframe === '1h' || this.timeframe === '4h') {
      return new Intl.DateTimeFormat(this.locale, {
        day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
      }).format(date);
    }
    return new Intl.DateTimeFormat(this.locale, {
      month: 'short', day: '2-digit', timeZone: 'UTC',
    }).format(date);
  }
}
