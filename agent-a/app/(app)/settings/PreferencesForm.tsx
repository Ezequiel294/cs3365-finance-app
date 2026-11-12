'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { WEEK_DAYS, type UserSettings, type WeekDay } from '@/shared/types';
import { updateSettings } from '../../actions/settings-actions';
import { Button } from '../../ui/Button';
import { FormField, inputClass } from '../../ui/FormField';
import { Section } from '../../ui/Section';
import { useToast } from '../../ui/Toast';

const ZONES = ['America/Costa_Rica', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Los_Angeles', 'America/Mexico_City', 'America/Panama', 'Europe/Madrid', 'UTC'];
const dayLabel = (d: WeekDay) => d.charAt(0) + d.slice(1).toLowerCase();

/** Week starts on, and time zone (03-S10). */
export function PreferencesForm({ settings }: { settings: UserSettings | null }) {
  const router = useRouter();
  const toast = useToast();
  const [weekStart, setWeekStart] = useState<WeekDay>(settings?.weekStart ?? 'MONDAY');
  const [timeZone, setTimeZone] = useState(settings?.timeZone ?? 'America/Costa_Rica');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const zones = ZONES.includes(timeZone) ? ZONES : [timeZone, ...ZONES];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const r = await updateSettings({ weekStart, timeZone });
    setPending(false);
    if (!r.ok) {
      setFields(r.fields ?? {});
      if (!r.fields) toast.show(r.message, { tone: 'negative' });
      return;
    }
    toast.show('Settings saved');
    router.refresh();
  };

  return (
    <Section title="Preferences">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormField label="Week starts on" hint="Weekly budgets are recalculated when you change this." error={fields.weekStart}>
          {({ id, describedBy }) => (
            <select id={id} className={inputClass} value={weekStart} onChange={(e) => setWeekStart(e.target.value as WeekDay)} aria-describedby={describedBy}>
              {WEEK_DAYS.map((d) => (
                <option key={d} value={d}>
                  {dayLabel(d)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Time zone" error={fields.timeZone}>
          {({ id }) => (
            <select id={id} className={inputClass} value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <div>
          <Button type="submit" variant="primary" pending={pending}>
            Save
          </Button>
        </div>
      </form>
    </Section>
  );
}
