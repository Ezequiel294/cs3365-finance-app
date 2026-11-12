import { describe, expect, it } from 'vitest';
import type { Connection } from '../../../shared/types';
import { FixedClock } from '../../src/clock';
import { ConnectionService, isStale } from '../../src/connections/connection-service';
import { UnauthorizedError } from '../../src/http/errors';
import { sha256Hex } from '../../src/ids';
import { TemplateRegistry } from '../../src/ingest/template-registry';
import { USER } from '../helpers';

function fakeIngestion() {
  const tokens = new Map<string, { userId: string; connectionId: string }>();
  const conns = new Map<string, Connection & { tokenHash?: string }>();
  return {
    tokens,
    conns,
    getToken: async (hash: string) => (tokens.has(hash) ? { tokenHash: hash, ...tokens.get(hash)! } : null),
    listConnections: async () => [...conns.values()],
    getConnection: async (_u: string, id: string) => conns.get(id) ?? null,
    writeConnection: async (userId: string, c: any, put: string | null, del: string | null) => {
      conns.set(c.id, c);
      if (put) tokens.set(put, { userId, connectionId: c.id });
      if (del) tokens.delete(del);
    },
    touchConnection: async (_u: string, id: string, at: string) => {
      const c = conns.get(id)!;
      if (c.status !== 'REVOKED') conns.set(id, { ...c, status: 'ACTIVE', lastSeenAt: at });
    },
    messageStats: async () => ({ imported: 12, unparsed: 1, rejected: 0, duplicate: 2 }),
  };
}

const clock = new FixedClock(new Date('2026-11-11T12:00:00Z'));

describe('ConnectionService (01-S08a, 01-S09, 06-S02)', () => {
  it('issues a token shown once, stores only its hash, and fills the API base into the script', async () => {
    const ing = fakeIngestion();
    const svc = new ConnectionService(ing, new TemplateRegistry(), clock, "var apiBase = '__API_BASE__';", 'https://api.example/');
    const setup = await svc.createGmail(USER);
    expect(setup.token.length).toBeGreaterThanOrEqual(40);
    expect(setup.script).toBe("var apiBase = 'https://api.example';");
    expect(setup.script).not.toContain(setup.token);
    expect([...ing.tokens.keys()]).toEqual([sha256Hex(setup.token)]);
    expect(JSON.stringify([...ing.conns.values()])).not.toContain(setup.token);
    const auth = await svc.authenticateAndTouch(setup.token);
    expect(auth).toMatchObject({ userId: USER, connectionId: setup.connectionId });
    expect(ing.conns.get(setup.connectionId)!.status).toBe('ACTIVE');
  });

  it('revoking deletes the hash, so the next call is 401', async () => {
    const ing = fakeIngestion();
    const svc = new ConnectionService(ing, new TemplateRegistry(), clock, '', '');
    const setup = await svc.createGmail(USER);
    await svc.revoke(USER, setup.connectionId);
    await expect(svc.authenticate(setup.token)).rejects.toBeInstanceOf(UnauthorizedError);
    const [view] = await svc.list(USER);
    expect(view!.connection.status).toBe('REVOKED');
    expect((view!.connection as any).tokenHash).toBeUndefined();
  });

  it('rotating replaces the key at once', async () => {
    const ing = fakeIngestion();
    const svc = new ConnectionService(ing, new TemplateRegistry(), clock, '', '');
    const first = await svc.createGmail(USER);
    const second = await svc.rotate(USER, first.connectionId);
    await expect(svc.authenticate(first.token)).rejects.toBeInstanceOf(UnauthorizedError);
    expect((await svc.authenticate(second.token)).connectionId).toBe(first.connectionId);
  });

  it('an active connection silent for over 24 h is stale', () => {
    const base = { status: 'ACTIVE' as const, createdAt: '2026-10-01T00:00:00Z' };
    expect(isStale({ ...base, lastSeenAt: '2026-11-10T11:00:00Z' }, clock.now())).toBe(true);
    expect(isStale({ ...base, lastSeenAt: '2026-11-10T13:00:00Z' }, clock.now())).toBe(false);
    expect(isStale({ ...base, status: 'PENDING', lastSeenAt: null }, clock.now())).toBe(false);
  });

  it('rejects missing or unknown tokens', async () => {
    const svc = new ConnectionService(fakeIngestion(), new TemplateRegistry(), clock, '', '');
    await expect(svc.authenticate(null)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(svc.authenticate('x'.repeat(43))).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
