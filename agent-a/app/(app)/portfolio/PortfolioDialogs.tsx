'use client';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import type { HoldingValue } from '@/shared/api-types';
import type { Broker, InvestmentTransaction } from '@/shared/types';
import { Button } from '../../ui/Button';
import { BrokerFeesForm } from './BrokerFeesForm';
import { InvestmentForm } from './InvestmentForm';

interface Ctx {
  record: () => void;
  correct: (tx: InvestmentTransaction) => void;
  editBroker: (broker: Broker | null) => void;
}

const PortfolioContext = createContext<Ctx>({ record: () => undefined, correct: () => undefined, editBroker: () => undefined });
export const usePortfolioDialogs = () => useContext(PortfolioContext);

/** Holds the portfolio's dialogs so "Record a transaction" works from any tab. */
export function PortfolioDialogs({ brokers, holdings, today, children }: { brokers: Broker[]; holdings: HoldingValue[]; today: string; children: ReactNode }) {
  const [investment, setInvestment] = useState<{ open: boolean; tx: InvestmentTransaction | null }>({ open: false, tx: null });
  const [broker, setBroker] = useState<{ open: boolean; broker: Broker | null }>({ open: false, broker: null });
  const ctx = useMemo<Ctx>(
    () => ({
      record: () => setInvestment({ open: true, tx: null }),
      correct: (tx) => setInvestment({ open: true, tx }),
      editBroker: (b) => setBroker({ open: true, broker: b }),
    }),
    [],
  );
  return (
    <PortfolioContext.Provider value={ctx}>
      {children}
      <InvestmentForm
        open={investment.open}
        correcting={investment.tx}
        brokers={brokers}
        holdings={holdings}
        today={today}
        onClose={() => setInvestment({ open: false, tx: null })}
      />
      <BrokerFeesForm open={broker.open} broker={broker.broker} onClose={() => setBroker({ open: false, broker: null })} />
    </PortfolioContext.Provider>
  );
}

export function RecordButton({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  const { record } = usePortfolioDialogs();
  return (
    <Button variant={variant} onClick={record}>
      Record a transaction
    </Button>
  );
}

export function AddBrokerButton({ variant = 'secondary' }: { variant?: 'primary' | 'secondary' }) {
  const { editBroker } = usePortfolioDialogs();
  return (
    <Button variant={variant} onClick={() => editBroker(null)}>
      Add a broker
    </Button>
  );
}

export function EditFeesButton({ broker }: { broker: Broker }) {
  const { editBroker } = usePortfolioDialogs();
  return <Button onClick={() => editBroker(broker)}>Edit fees</Button>;
}

export function CorrectButton({ tx }: { tx: InvestmentTransaction }) {
  const { correct } = usePortfolioDialogs();
  return (
    <Button variant="link" onClick={() => correct(tx)}>
      Edit
    </Button>
  );
}
