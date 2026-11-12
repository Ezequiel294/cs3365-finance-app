import type { MonthTotal } from '@/shared/api-types';
import { ChartFrame } from '../../ui/charts/ChartFrame';
import { ColumnChart } from '../../ui/charts/ColumnChart';
import { formatMoney, formatMonth } from '../../ui/format';

/** Money in (slot 1) and spending (slot 2) per month (04-S06). Needs three months with data. */
export function MoneyInOutChart({ title, months }: { title: string; months: MonthTotal[] }) {
  const withData = months.filter((m) => m.incomeCents !== 0 || m.expenseCents !== 0).length;
  const last = months[months.length - 1];
  const summary = last
    ? `In ${formatMonth(last.month)} ${formatMoney(last.incomeCents)} came in and ${formatMoney(last.expenseCents)} was spent.`
    : 'No months to show.';
  return (
    <ChartFrame
      title={title}
      summary={summary}
      legend={[
        { label: 'Money in', seriesSlot: 1 },
        { label: 'Spending', seriesSlot: 2 },
      ]}
      points={withData}
      minPoints={3}
      notEnoughData={`Trends appear after three months of data. You have ${withData} so far.`}
      table={{
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'in', label: 'Money in', align: 'right' },
          { key: 'spent', label: 'Spent', align: 'right' },
        ],
        rows: [...months].reverse().map((m) => ({ _key: m.month, month: formatMonth(m.month), in: formatMoney(m.incomeCents), spent: formatMoney(m.expenseCents) })),
      }}
    >
      <ColumnChart
        months={months.map((m) => m.month)}
        series={[
          { label: 'Money in', seriesSlot: 1, valuesCents: months.map((m) => m.incomeCents) },
          { label: 'Spending', seriesSlot: 2, valuesCents: months.map((m) => Math.max(0, m.expenseCents)) },
        ]}
      />
    </ChartFrame>
  );
}
