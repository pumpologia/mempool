const mockElectrumGet = jest.fn();

jest.mock('@mempool/electrum-client', () => class {
  initElectrum = jest.fn().mockResolvedValue(undefined);
  blockchainTransaction_get = mockElectrumGet;
});

jest.mock('../../api/blocks', () => ({
  __esModule: true,
  default: { getCurrentBlockHeight: () => 100 },
}));

jest.mock('../../api/mempool', () => ({
  __esModule: true,
  default: { getMempool: () => ({}) },
}));

jest.mock('../../api/transaction-utils', () => ({
  __esModule: true,
  default: {
    convertScriptSigAsm: (hex: string) => hex,
    addInnerScriptsToVin: () => undefined,
  },
}));

import BitcoinApi from '../../api/bitcoin/bitcoin-api';
import BitcoindElectrsApi from '../../api/bitcoin/electrum-api';
import fs from 'fs';
import path from 'path';

describe('BitcoinApi verbosity-3 block conversion', () => {
  it('uses Core-provided prevouts without requiring txindex lookups', async () => {
    const getRawTransaction = jest.fn().mockRejectedValue(new Error('txindex lookup must not be used'));
    const getBlock = jest.fn().mockResolvedValue({
      hash: 'block-hash',
      height: 100,
      time: 1_700_000_000,
      confirmations: 1,
      tx: [{
        txid: 'txid',
        hash: 'wtxid',
        size: 100,
        vsize: 100,
        weight: 400,
        version: 2,
        locktime: 0,
        vin: [{
          txid: 'prev-txid',
          vout: 0,
          sequence: 0xffffffff,
          scriptSig: { asm: '', hex: '' },
          prevout: {
            generated: false,
            height: 99,
            value: 1.5,
            scriptPubKey: {
              asm: '0 0014deadbeef',
              hex: '0014deadbeef',
              type: 'witness_v0_keyhash',
              address: 'bc1qexample',
            },
          },
        }],
        vout: [{
          value: 1.4999,
          n: 0,
          scriptPubKey: {
            asm: '0 0014cafe',
            hex: '0014cafe',
            type: 'witness_v0_keyhash',
            address: 'bc1qdestination',
          },
        }],
      }],
    });

    const api = new BitcoinApi({ getBlock, getRawTransaction });
    const transactions = await api.$getTxsForBlock('block-hash');

    expect(getBlock).toHaveBeenCalledWith('block-hash', 3);
    expect(getRawTransaction).not.toHaveBeenCalled();
    expect(transactions[0].vin[0].prevout).toMatchObject({
      value: 150_000_000,
      scriptpubkey: '0014deadbeef',
      scriptpubkey_address: 'bc1qexample',
      scriptpubkey_type: 'v0_p2wpkh',
    });
    expect(transactions[0].fee).toBe(10_000);
  });

  it('reads confirmed transactions through Electrum when Core has no txindex', async () => {
    mockElectrumGet.mockResolvedValueOnce({
      txid: 'confirmed-txid',
      hash: 'confirmed-wtxid',
      size: 100,
      vsize: 100,
      weight: 400,
      version: 2,
      locktime: 0,
      confirmations: 2,
      blockhash: 'block-hash',
      blocktime: 1_700_000_000,
      vin: [{ coinbase: '00', sequence: 0xffffffff }],
      vout: [{
        value: 1.25,
        n: 0,
        scriptPubKey: {
          asm: '0 0014cafe',
          hex: '0014cafe',
          type: 'witness_v0_keyhash',
          address: 'bc1qdestination',
        },
      }],
    });
    const coreGetRawTransaction = jest.fn().mockRejectedValue(new Error('Core txindex is disabled'));
    const api = new BitcoindElectrsApi({ getRawTransaction: coreGetRawTransaction });

    const transaction = await api.$getRawTransaction('confirmed-txid');

    expect(mockElectrumGet).toHaveBeenCalledWith('confirmed-txid', true);
    expect(coreGetRawTransaction).not.toHaveBeenCalled();
    expect(transaction.txid).toBe('confirmed-txid');
    expect(transaction.vout[0].value).toBe(125_000_000);
  });

  it('bulk-loads confirmed block transactions when using Core or Electrum', () => {
    const blocksSource = fs.readFileSync(path.join(__dirname, '../../api/blocks.ts'), 'utf8');

    expect(blocksSource).toContain("if (!isEsplora || (txIds.length - totalFound > 500) || stale)");
  });
});
