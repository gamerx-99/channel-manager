import { useEffect, useState } from "react";
import { TAX_ID_PATTERN } from "@shared/bookingDocuments";
import { trpc } from "@/lib/trpc";

export type InvoiceHeaderForm = { enabled: boolean; issuerName: string; address: string; taxId: string; branch: string; phone: string; vatEnabled: boolean; vatRate: number; withholdingEnabled: boolean; withholdingRate: number };

const EMPTY: InvoiceHeaderForm = { enabled: false, issuerName: "", address: "", taxId: "", branch: "", phone: "", vatEnabled: false, vatRate: 7, withholdingEnabled: false, withholdingRate: 3 };

/** An empty tax ID is allowed (receipts only); anything typed must be 13 digits. */
export function invoiceTaxIdValid(taxId: string): boolean {
  return taxId === "" || TAX_ID_PATTERN.test(taxId);
}

export function useHotelInvoiceSettings(hotelId: string, fallback: { name: string; address: string }) {
  const utils = trpc.useUtils();
  const query = trpc.bookingDocuments.settings.useQuery({ hotel_id: hotelId });
  const [form, setForm] = useState<InvoiceHeaderForm>(EMPTY);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!query.isSuccess) return;
    const row = query.data;
    // A hotel that never saved a header starts from its own name and address.
    setForm(row
      ? { enabled: row.enabled, issuerName: row.issuerName, address: row.address, taxId: row.taxId ?? "", branch: row.branch ?? "", phone: row.phone ?? "", vatEnabled: row.vatEnabled, vatRate: row.vatRate, withholdingEnabled: row.withholdingEnabled, withholdingRate: row.withholdingRate }
      : { ...EMPTY, issuerName: fallback.name, address: fallback.address });
  }, [query.isSuccess, query.data, fallback.name, fallback.address]);
  const save = trpc.bookingDocuments.saveSettings.useMutation({
    async onSuccess() {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await utils.bookingDocuments.settings.invalidate({ hotel_id: hotelId });
    },
  });
  const update = (patch: Partial<InvoiceHeaderForm>) => { setSaved(false); setForm(current => ({ ...current, ...patch })); };
  const canSave = form.issuerName.trim() !== "" && form.address.trim() !== "" && invoiceTaxIdValid(form.taxId) && !save.isPending;
  const submit = () => save.mutate({
    hotel_id: hotelId, enabled: form.enabled, issuer_name: form.issuerName, address: form.address,
    tax_id: form.taxId || null, branch: form.branch || null, phone: form.phone || null,
    vat_enabled: form.vatEnabled, vat_rate: form.vatRate,
    withholding_enabled: form.withholdingEnabled, withholding_rate: form.withholdingRate,
  });
  return { form, update, submit, canSave, saved, save, isLoading: query.isLoading };
}
