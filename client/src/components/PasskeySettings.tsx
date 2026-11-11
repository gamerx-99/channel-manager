import React, { useState } from "react";
import { Fingerprint } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { dateLocale } from "@/lib/dateLocale";
import { useTranslation } from "@/lib/i18n";
import { classifyPasskeyError, defaultPasskeyName, passkeySupported } from "@/lib/passkey";

/** Lists, adds and deletes the passkeys of the signed-in user (security settings). */
export default function PasskeySettings() {
  const { t, language } = useTranslation();
  const passkeys = authClient.useListPasskeys();
  const supported = passkeySupported();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setAdding(true);
    setError(null);
    const label = name.trim() || defaultPasskeyName(navigator.userAgent);
    const { error: addError } = await authClient.passkey.addPasskey({ name: label });
    setAdding(false);
    if (!addError) {
      setName("");
      return;
    }
    const failure = classifyPasskeyError(addError);
    if (failure === "alreadyAdded") setError(t("passkey.alreadyAdded"));
    else if (failure === "failed") setError(t("passkey.addFailed"));
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(t("passkey.confirmDelete", { name: label }))) return;
    setError(null);
    const { error: deleteError } = await authClient.passkey.deletePasskey({ id });
    if (deleteError) setError(t("passkey.deleteFailed"));
  }

  const list = passkeys.data ?? [];

  return (
    <section className="panel passkey-settings" aria-labelledby="passkey-heading" data-testid="passkey-settings">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{t("passkey.eyebrow")}</div>
          <h2 id="passkey-heading"><Fingerprint size={20} aria-hidden="true" /> {t("passkey.title")}</h2>
          <p className="lede">{t("passkey.lede")}</p>
        </div>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {passkeys.error ? <p className="form-error" role="alert">{t("passkey.loadFailed")}</p> : null}
      {list.length === 0 && !passkeys.isPending && !passkeys.error ? <p className="field-help">{t("passkey.empty")}</p> : null}
      <ul className="linked-accounts-list">
        {list.map(item => {
          const label = item.name || t("passkey.unnamed");
          return (
            <li key={item.id}>
              <span className="linked-accounts-name">
                <Fingerprint size={16} aria-hidden="true" />
                <span>{label}</span>
                {item.createdAt ? <small className="passkey-date">{t("passkey.addedOn", { date: new Date(item.createdAt).toLocaleDateString(dateLocale(language)) })}</small> : null}
              </span>
              <button type="button" className="button button-quiet" onClick={() => void remove(item.id, label)}>
                {t("passkey.delete")}
              </button>
            </li>
          );
        })}
      </ul>
      {supported ? (
        <form className="passkey-add" onSubmit={event => { event.preventDefault(); void add(); }}>
          <label>
            {t("passkey.nameLabel")}
            <input type="text" maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder={t("passkey.namePlaceholder")} disabled={adding} />
          </label>
          <button type="submit" className="button button-primary" disabled={adding}>
            {adding ? t("passkey.adding") : t("passkey.add")}
          </button>
        </form>
      ) : <p className="field-help">{t("passkey.unsupported")}</p>}
    </section>
  );
}
