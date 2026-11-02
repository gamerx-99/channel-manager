import React, { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Hotel as HotelIcon, Mail } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function AccountOnboarding() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const createHotel = trpc.channelManager.registerOwnHotel.useMutation();
  const { data: me } = trpc.auth.me.useQuery();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState(me?.phone ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me?.phone && !contact) setContact(me.phone);
  }, [me?.phone, contact]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!SLUG_PATTERN.test(slug)) {
      setError(t("onboarding.slugInvalid"));
      return;
    }
    try {
      await createHotel.mutateAsync({ name, slug, address, owner_contact: contact });
    } catch (mutationError) {
      const code = (mutationError as { data?: { code?: string } } | null)?.data?.code;
      setError(code === "CONFLICT" ? t("onboarding.slugTaken") : code === "BAD_REQUEST" ? t("onboarding.slugReserved") : t("onboarding.createFailed"));
      return;
    }
    void utils.auth.me.invalidate();
    void utils.channelManager.hotels.invalidate();
  }

  return (
    <div className="page-content">
      <section className="page-intro">
        <div className="eyebrow">{t("onboarding.eyebrow")}</div>
        <h1>{t("onboarding.title")}<span className="title-mark">.</span></h1>
        <p className="lede">{t("onboarding.lede")}</p>
      </section>
      <section className="panel onboarding-card" style={{ maxWidth: 760 }}>
        <div className="panel-heading onboarding-card-heading"><h2><HotelIcon size={19} /> {t("onboarding.createTitle")}</h2></div>
        <div className="onboarding-card-body">
        <p className="text-muted-foreground">{t("onboarding.createDesc")}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>{t("onboarding.hotelName")}<input value={name} onChange={event => setName(event.target.value)} maxLength={160} required /></label>
            <label>{t("onboarding.slug")}<span className="signup-slug"><span>{typeof window === "undefined" ? "" : window.location.host}/</span><input value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} maxLength={100} autoCapitalize="none" spellCheck={false} required /></span></label>
            <label className="form-span-two">{t("onboarding.address")}<input value={address} onChange={event => setAddress(event.target.value)} maxLength={500} autoComplete="street-address" required /></label>
            <label className="form-span-two">{t("onboarding.contact")}<input type="tel" value={contact} onChange={event => setContact(event.target.value)} maxLength={180} autoComplete="tel" required /></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={createHotel.isPending}>
            {createHotel.isPending ? t("onboarding.creating") : t("onboarding.createButton")} <ArrowRight size={16} />
          </button>
        </form>
        </div>
      </section>
      <section className="panel onboarding-card" style={{ maxWidth: 760, marginTop: 20 }}>
        <div className="panel-heading onboarding-card-heading"><h2><Mail size={19} /> {t("onboarding.staffTitle")}</h2></div>
        <div className="onboarding-card-body"><p className="text-muted-foreground">{t("onboarding.staffDesc")}</p></div>
      </section>
    </div>
  );
}
