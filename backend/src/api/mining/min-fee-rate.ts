/**
 * Minimum "fee-merit" effective fee rate for a single block (mempool issue #6639).
 *
 * Exclusion reuses the audit's `identifyPrioritizedTransactions`: the longest
 * non-decreasing subsequence of effective fee rate in reversed block order is treated as
 * "in position", and transactions below the last in-position rate are prioritized. Only
 * those are dropped — a deprioritized transaction paid more than its position implies and
 * still earned inclusion on fee merit.
 *
 * Pure module (no DB, no I/O) so the exclusion logic can be unit-tested exhaustively.
 */
import transactionUtils from '../transaction-utils';

/**
 * Minimum cpfpSummary version whose `rate` is CPFP-effective. Version 0 has no `rate`,
 * and version 1 is ambiguous (effective when esplora-indexed, nominal via the
 * no-cpfpSummary fallback in blocks.ts).
 */
export const MIN_CPFP_SUMMARY_VERSION = 2;

/**
 * Bump whenever the algorithm changes; blocks with a lower stored version are recomputed.
 * @3: exclusion moved from a greedy baseline scan to the audit's LIS criterion.
 */
export const MIN_FEE_RATE_VERSION = 3;

/**
 * Bitcoin Core 30.0 was released on 2025-10-10 and changed the default
 * minrelaytxfee to 0.1 sat/vB. The series is intentionally undefined before then.
 */
export const MIN_FEE_RATE_START_TIMESTAMP = Date.UTC(2025, 9, 10) / 1000;

export interface MinFeeRateTx {
  txid: string;
  effectiveFeePerVsize?: number;
}

export interface MinFeeRateDay {
  minRate: number;
  minHeight: number;
  timestamp: number;
}

/**
 * Computes a block's minimum fee-merit effective fee rate from the block's transactions
 * in block order, coinbase first. A null result is a valid answer for a block with no
 * qualifying non-coinbase transaction.
 */
export function computeMinFeeRate(
  orderedTxs: readonly MinFeeRateTx[],
  acceleratedTxids: ReadonlySet<string>,
): number | null {
  if (orderedTxs.length < 2) {
    return null;
  }

  // Zero-fee transactions are dropped before the LIS runs, not just from the final
  // minimum: an in-position zero rate presents no inversion to detect, and in a
  // near-empty block a pair of them forms the longest chain and becomes the baseline the
  // genuine payers are judged against.
  const feePaying = orderedTxs.slice(1).filter(tx => (tx.effectiveFeePerVsize ?? 0) > 0);
  if (!feePaying.length) {
    return null;
  }

  // The coinbase is kept at index 0 because identifyPrioritizedTransactions skips it
  // positionally; it carries no fee and must not shift that offset.
  const { prioritized } = transactionUtils.identifyPrioritizedTransactions(
    [orderedTxs[0], ...feePaying],
    'effectiveFeePerVsize',
  );
  const excluded = new Set<string>(prioritized);

  let min: number | null = null;
  for (const tx of feePaying) {
    if (excluded.has(tx.txid) || acceleratedTxids.has(tx.txid)) {
      continue;
    }
    const rate = tx.effectiveFeePerVsize as number;
    if (min === null || rate < min) {
      min = rate;
    }
  }

  return min;
}
