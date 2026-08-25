import { IconName } from '@fortawesome/fontawesome-common-types';
import { PumpologiaOperation } from '@app/services/pumpologia-api.service';

export type PumpologiaEventKind =
  'long' | 'short' | 'close' | 'liquidation' | 'take-profit' | 'stop-loss' | 'timeout' | 'expiration' | 'event';

export function pumpologiaEventKind(operation: PumpologiaOperation): PumpologiaEventKind {
  const type = operation.type.toLowerCase().replace(/\s+/g, '_');
  if (type === 'long' || type === 'short' || type === 'close' || type === 'liquidation'
    || type === 'timeout' || type === 'expiration') return type;
  if (type === 'take_profit') return 'take-profit';
  if (type === 'stop_loss') return 'stop-loss';
  return 'event';
}

export function pumpologiaEventIcon(operation: PumpologiaOperation): IconName {
  switch (pumpologiaEventKind(operation)) {
    case 'long':
    case 'short': return 'arrow-right';
    case 'close': return 'exchange-alt';
    case 'liquidation': return 'ban';
    case 'take-profit': return 'circle-check';
    case 'stop-loss': return 'circle-xmark';
    case 'timeout':
    case 'expiration': return 'clock';
    default: return 'timeline';
  }
}

export function pumpologiaEventLabel(operation: PumpologiaOperation): string {
  switch (pumpologiaEventKind(operation)) {
    case 'long': return 'Long opened';
    case 'short': return 'Short opened';
    case 'close': return 'Position closed';
    case 'liquidation': return 'Position liquidated';
    case 'take-profit': return 'Take profit reached';
    case 'stop-loss': return 'Stop loss reached';
    case 'timeout': return 'Position timed out';
    case 'expiration': return 'Position expired';
    default: return operation.type || 'Protocol event';
  }
}

export function pumpologiaPnlLabel(operation: PumpologiaOperation): string {
  if (operation.pnl_kind === 'realized') return 'Realized P&L';
  if (operation.pnl_kind === 'unrealized') return 'Live P&L';
  return 'P&L pending';
}
