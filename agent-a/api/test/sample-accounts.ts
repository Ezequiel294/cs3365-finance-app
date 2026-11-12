import type { Account } from '../../shared/types';

/** The accounts the expected results assume (samples/README.md). */
export const SAMPLE_ACCOUNTS: Account[] = [
  { id: 'acc-bac-usd', name: 'BAC dólares', bank: 'BAC', type: 'bank', currency: 'USD', iban: 'CR00010200001234567890', cardLast4s: [], version: 1 },
  { id: 'acc-bac-crc', name: 'BAC colones', bank: 'BAC', type: 'bank', currency: 'CRC', iban: 'CR00010200000123456781', cardLast4s: ['1111'], version: 1 },
  { id: 'acc-bn-usd', name: 'BN dólares', bank: 'BN', type: 'bank', currency: 'USD', iban: null, cardLast4s: [], version: 1 },
  { id: 'acc-bn-crc', name: 'BN colones', bank: 'BN', type: 'bank', currency: 'CRC', iban: null, cardLast4s: ['2222'], version: 1 },
];
