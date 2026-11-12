import type { BurndownSeries } from '@/shared/api-types';
import { ChartFrame } from '../../ui/charts/ChartFrame';
import { LineChart } from '../../ui/charts/LineChart';
import { formatDay, formatMoney } from '../../ui/format';
import { Section } from '../../ui/Section';

/** For the open budget: spent so far against the even pace and the limit (03-S11). */
export function BurndownSection({ name, series, today, currentYear }: { name: string; series: BurndownSeries; today: string; currentYear: number }) {
  const spent = series.cumulativeSpentCents[series.cumulativeSpentCents.length - 1] ?? 0;
  const pace = series.paceCents[series.cumulativeSpentCents.length - 1] ?? 0;
  const summary =
    series.cumulativeSpentCents.length === 0
      ? `This period has not started yet.`
      : `${formatMoney(spent)} spent so far against an even pace of ${formatMoney(pace)} and a limit of ${formatMoney(series.limitCents)}.`;
  return (
    <Section title={`${name}: spending against an even pace`} wide>
      <ChartFrame
        title="Burn-down"
        summary={summary}
        legend={[
          { label: 'Spent', seriesSlot: 1 },
          { label: 'Even pace', seriesSlot: 0 },
        ]}
        table={{
          columns: [
            { key: 'date', label: 'Day' },
            { key: 'spent', label: 'Spent so far', align: 'right' },
            { key: 'pace', label: 'Even pace', align: 'right' },
          ],
          rows: series.dates.map((d, i) => ({
            _key: d,
            date: formatDay(d, currentYear),
            spent: i < series.cumulativeSpentCents.length ? formatMoney(series.cumulativeSpentCents[i]!) : '—',
            pace: formatMoney(series.paceCents[i]!),
          })),
        }}
      >
        <LineChart
          dates={series.dates}
          today={today}
          series={[
            { label: 'Spent', valuesCents: series.cumulativeSpentCents },
            { label: 'Even pace', valuesCents: series.paceCents, context: true },
          ]}
          limit={{ label: `Limit ${formatMoney(series.limitCents)}`, valueCents: series.limitCents }}
        />
      </ChartFrame>
    </Section>
  );
}
