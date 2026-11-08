import { getReference } from "@/actions/setup-actions";
import { ImportUploader } from "@/components/import-uploader";

/** 01-S02 and 05-S06: import a downloaded statement; each row keeps its own currency. */
export default async function ImportPage() {
  const ref = await getReference();
  return (
    <>
      <h1>Import a statement</h1>
      <p className="muted">
        The file goes straight to private storage and is matched to a bank template by its header row. Rows that cannot be read are listed with
        the reason; the rest still import. Importing the same file twice is refused, and rows already imported from an overlapping statement are skipped.
      </p>
      <p className="muted small">Supported layouts: Example Bank (placeholder template until real bank samples are available).</p>
      {ref.ok ? <ImportUploader accounts={ref.data.accounts} /> : <p className="error-text">{ref.error}</p>}
    </>
  );
}
