import { loadCatalog, loadSettings } from '../../lib/loaders';
import { ErrorState } from '../../ui/ErrorState';
import { PageHeader } from '../../ui/PageHeader';
import { SectionGrid } from '../../ui/Section';
import { CatalogEditor } from './CatalogEditor';
import { PreferencesForm } from './PreferencesForm';

export const dynamic = 'force-dynamic';

/** How do I change how the app counts and names things? (02-S02a, 03-S10) */
export default async function SettingsPage() {
  const [settings, catalog] = await Promise.all([loadSettings(), loadCatalog()]);
  const failed = !settings.ok ? settings : !catalog.ok ? catalog : null;
  if (failed && !failed.ok) return <><PageHeader title="Settings" /><ErrorState message={failed.message} /></>;
  return (
    <>
      <PageHeader title="Settings" />
      <SectionGrid>
        <PreferencesForm settings={settings.ok ? settings.data : null} />
        <CatalogEditor catalog={catalog.ok ? catalog.data : { categories: [], tags: [] }} />
      </SectionGrid>
    </>
  );
}
