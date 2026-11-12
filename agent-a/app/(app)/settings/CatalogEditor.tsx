'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Catalog } from '@/shared/api-types';
import { createCategory, createTag } from '../../actions/catalog-actions';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { FormField, inputClass } from '../../ui/FormField';
import { Section } from '../../ui/Section';
import { useToast } from '../../ui/Toast';

function InlineAdd({ label, onAdd }: { label: string; onAdd: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const err = await onAdd(name);
        setPending(false);
        setError(err);
        if (!err) setName('');
      }}
    >
      <div className="flex-1">
        <FormField label={label} error={error}>
          {({ id, describedBy, invalid }) => <input id={id} className={inputClass} required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
        </FormField>
      </div>
      <Button type="submit" pending={pending} className={error ? 'mb-6' : undefined}>
        Add
      </Button>
    </form>
  );
}

/** Built-in and own categories, and the user's tags, each with one inline add field (02-S02a). */
export function CatalogEditor({ catalog }: { catalog: Catalog }) {
  const router = useRouter();
  const toast = useToast();
  const own = catalog.categories.filter((c) => c.scope === 'user');
  const builtIn = catalog.categories.filter((c) => c.scope === 'global');

  const add = (kind: 'category' | 'tag') => async (name: string) => {
    const r = kind === 'category' ? await createCategory(name) : await createTag(name);
    if (!r.ok) return r.fields?.name ?? r.message;
    toast.show(kind === 'category' ? `Category ${r.data.name} added` : `Tag ${r.data.name} added`);
    router.refresh();
    return null;
  };

  return (
    <>
      <Section title="Categories">
        <ul className="flex flex-wrap gap-2">
          {builtIn.map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
              {c.name} <Badge label="Built-in" />
            </li>
          ))}
          {own.map((c) => (
            <li key={c.id} className="rounded-full border border-border px-3 py-1 text-sm">
              {c.name}
            </li>
          ))}
        </ul>
        <InlineAdd label="New category" onAdd={add('category')} />
      </Section>
      <Section title="Tags">
        {catalog.tags.length ? (
          <ul className="flex flex-wrap gap-2">
            {catalog.tags.map((t) => (
              <li key={t.id} className="rounded-full border border-border px-3 py-1 text-sm">
                {t.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">No tags yet. Tags group purchases across categories, for example University or Trip to Panama.</p>
        )}
        <InlineAdd label="New tag" onAdd={add('tag')} />
      </Section>
    </>
  );
}
