import type { Account } from '@finance/shared';
import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/clock';
import { UnauthorizedError, ValidationError } from '../../src/errors';
import { TemplateRegistry } from '../../src/ingest/template-registry';
import type { IngestToken, StoredConnection } from '../../src/repositories/ingestion-repository';
import { AccountService } from '../../src/services/account-service';
import { ConnectionService, isStale } from '../../src/services/connection-service';

const NOW = new Date('2026-11-10T15:00:00Z');

function fakeIngestion() {
  const connections = new Map<string, StoredConnection>();
  const tokens = new Map<string, IngestToken>();
  return {
    connections,
    tokens,
    writeConnection: async (_u: string, c: StoredConnection, put?: IngestToken, del?: string | null) => {
      connections.set(c.id, c);
      if (put) tokens.set(put.tokenHash, put);
      if (del) tokens.delete(del);
    },
    getToken: async (h: string) => tokens.get(h),
    getConnection: async (_u: string, id: string) => connections.get(id),
    listConnections: async () => [...connections.values()],
    touchConnection: async (_u: string, id: string, at: string) => {
      const c = connections.get(id)!;
      if (c.status !== 'REVOKED') connections.set(id, { ...c, status: 'ACTIVE', lastSeenAt: at });
    },
    messageStats: async () => ({ imported: 12, unparsed: 1, rejected: 0, duplicate: 0 }),
  };
}

describe('ConnectionService', () => {
  const build = () => {
    const ingestion = fakeIngestion();
    const service = new ConnectionService(ingestion as never, new TemplateRegistry(), new FixedClock(NOW), (base) => `var API_BASE = '${base}';`);
    return { ingestion, service };
  };

  it('stores only the token hash and returns the token once with the script (01-S08a)', async () => {
    const { ingestion, service } = build();
    const setup = await service.createGmail('u', 'https://api.example');
    expect(setup.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(setup.script).toContain('https://api.example');
    const stored = [...ingestion.tokens.keys()][0];
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
    expect(stored).not.toContain(setup.token);
    expect(ingestion.connections.get(setup.connectionId)).toMatchObject({ status: 'PENDING', tokenPrefix: setup.token.slice(0, 6) });
  });

  it('activates on config and returns the sender allowlist', async () => {
    const { ingestion, service } = build();
    const setup = await service.createGmail('u', 'https://api.example');
    expect(await service.config(setup.token)).toEqual({ senders: ['notificacionbac@baccredomatic.cr', 'bncontacto@bncr.fi.cr'], label: 'financeapp-processed' });
    expect(ingestion.connections.get(setup.connectionId)).toMatchObject({ status: 'ACTIVE', lastSeenAt: NOW.toISOString() });
  });

  it('rejects an unknown token and a revoked one (06-S02)', async () => {
    const { service } = build();
    await expect(service.authenticate('x'.repeat(43))).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(service.authenticate(undefined)).rejects.toBeInstanceOf(UnauthorizedError);
    const setup = await service.createGmail('u', 'https://api.example');
    await service.revoke('u', setup.connectionId);
    await expect(service.authenticate(setup.token)).rejects.toBeInstanceOf(UnauthorizedError);
    const [view] = await service.list('u');
    expect(view.connection.status).toBe('REVOKED');
    expect((view.connection as StoredConnection).tokenHash).toBeUndefined();
  });

  it('rotates the token: the old one stops working, the new one works (01-S09)', async () => {
    const { service } = build();
    const first = await service.createGmail('u', 'https://api.example');
    const second = await service.rotate('u', first.connectionId, 'https://api.example');
    await expect(service.authenticate(first.token)).rejects.toBeInstanceOf(UnauthorizedError);
    expect((await service.authenticate(second.token)).connectionId).toBe(first.connectionId);
  });

  it('marks an active connection stale after 24 hours without a heartbeat', () => {
    expect(isStale({ status: 'ACTIVE', lastSeenAt: new Date(NOW.getTime() - 25 * 3600000).toISOString() }, NOW)).toBe(true);
    expect(isStale({ status: 'ACTIVE', lastSeenAt: new Date(NOW.getTime() - 23 * 3600000).toISOString() }, NOW)).toBe(false);
    expect(isStale({ status: 'PENDING', lastSeenAt: null }, NOW)).toBe(false);
  });
});

describe('AccountService', () => {
  const build = () => {
    const accounts: Account[] = [];
    const reference = {
      listAccounts: async () => accounts,
      getAccount: async (_u: string, id: string) => accounts.find((a) => a.id === id),
      putAccount: async (_u: string, a: Account) => void accounts.push(a),
      updateAccount: async (_u: string, a: Account) => void accounts.splice(accounts.findIndex((x) => x.id === a.id), 1, a),
    };
    return new AccountService(reference as never);
  };

  it('registers an account and refuses a card that belongs to another account (01-S02a)', async () => {
    const service = build();
    const usd = await service.create('u', { name: 'BAC dólares', bank: 'BAC', currency: 'USD', type: 'bank', iban: null, cardLast4s: ['1111'] });
    expect(usd).toMatchObject({ version: 1, cardLast4s: ['1111'] });
    await expect(service.create('u', { name: 'BAC colones', bank: 'BAC', currency: 'CRC', type: 'bank', cardLast4s: ['1111'] })).rejects.toThrow(
      new ValidationError('Card 1111 is already on "BAC dólares"'),
    );
    const updated = await service.update('u', usd.id, { cardLast4s: ['1111', '3333'], version: 1 }, 1);
    expect(updated).toMatchObject({ version: 2, cardLast4s: ['1111', '3333'] });
  });
});
