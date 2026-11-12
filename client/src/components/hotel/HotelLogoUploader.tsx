import React from "react";
import { useTranslation } from "@/lib/i18n";
import { useHotelLogo } from "./useHotelLogo";

export function HotelLogoUploader({ hotelId, logoUrl, onChanged }: { hotelId: string; logoUrl?: string | null; onChanged: () => unknown }) {
  const { t } = useTranslation();
  const { busy, error, upload, remove } = useHotelLogo(hotelId, onChanged);
  return (
    <section className="panel hotel-logo-panel">
      <div className="panel-heading"><div><h2>{t("hotelProfile.logoHeading")}</h2></div></div>
      <div className="hotel-logo-row">
        {logoUrl ? <img className="hotel-logo-preview" src={logoUrl} alt="" /> : null}
        <label className="button button-quiet hotel-logo-pick">
          {logoUrl ? t("hotelProfile.logoReplace") : t("hotelProfile.logoUpload")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            hidden
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
        {logoUrl ? <button type="button" className="button button-quiet" disabled={busy} onClick={() => void remove()}>{t("hotelProfile.logoRemove")}</button> : null}
      </div>
      <small>{t("hotelProfile.logoHint")}</small>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}

export default HotelLogoUploader;
