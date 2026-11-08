import { getReference, getSettings } from "@/actions/setup-actions";
import { AccountForm, LabelForm, SettingsForm } from "@/components/setup-forms";

/** Supporting setup for the in-scope stories: accounts, own categories and tags, time zone, week start. */
export default async function SettingsPage() {
  const [ref, settings] = await Promise.all([getReference(), getSettings()]);
  if (!ref.ok) return <p className="error-text">{ref.error}</p>;
  const { accounts, categories, tags } = ref.data;

  return (
    <>
      <h1>Settings</h1>
      <div className="card">
        <h3>Accounts</h3>
        {accounts.length === 0 ? (
          <p className="muted">No accounts yet. Add the accounts and cards you record transactions against.</p>
        ) : (
          <table>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td className="muted">{a.bank}</td>
                  <td>{a.currency}</td>
                  <td className="muted">{a.last4 ? `•••• ${a.last4}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3>Add an account</h3>
        <AccountForm />
      </div>

      <div className="card">
        <h3>Categories</h3>
        <p>
          {categories.map((c) => (
            <span key={c.id} className="pill">
              {c.name}
            </span>
          ))}
        </p>
        <LabelForm kind="category" />
        <h3>Tags</h3>
        <p>
          {tags.map((t) => (
            <span key={t.id} className="pill">
              {t.name}
            </span>
          ))}
        </p>
        <LabelForm kind="tag" />
      </div>

      <div className="card">
        <h3>Profile</h3>
        <p className="muted small">Totals are kept in USD. The time zone decides each transaction&apos;s date; the week start decides weekly budgets.</p>
        {settings.ok && <SettingsForm settings={settings.data} />}
      </div>
    </>
  );
}
