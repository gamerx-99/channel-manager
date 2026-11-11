import React from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { LegalDocumentBody } from "@/components/LegalDocument";
import { useHotelPrivacy } from "./useHotelPrivacy";
import "./legal-page.css";

/** A hotel's privacy notice for its guests; the booking consent box links here. */
export default function HotelPrivacy({ slug }: { slug: string }) {
  const { t, hotel, document, loading, failed } = useHotelPrivacy(slug);

  if (loading) return <main className="legal-page" role="status">{t("hotelPrivacy.loading")}</main>;
  if (failed || !hotel || !document) {
    return (
      <main className="legal-page">
        <h1>{t("hotelPrivacy.notFound")}</h1>
        <Link href="/" className="legal-back"><ArrowLeft size={16} aria-hidden="true" /> {t("legal.backToHome")}</Link>
      </main>
    );
  }
  return (
    <main className="legal-page" data-testid="hotel-privacy">
      <Link href={`/${encodeURIComponent(slug)}`} className="legal-back"><ArrowLeft size={16} aria-hidden="true" /> {t("hotelPrivacy.back", { hotel: hotel.name })}</Link>
      <h1>{t("hotelPrivacy.title", { hotel: hotel.name })}</h1>
      <p className="legal-updated">{t("legal.updated")}</p>
      <LegalDocumentBody document={document} />
    </main>
  );
}
