import { useState } from "react";
import { TAX_ID_PATTERN, type BookingDocumentSnapshot, type BookingDocumentType } from "@shared/bookingDocuments";
import { buildBookingDocumentHtml, downloadDocumentFile, downloadPdfBase64, writePrintWindow, type BookingDocumentLabels } from "@/lib/bookingDocumentPrint";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

const LABEL_KEYS = [
  "invoiceTitle", "receiptTitle", "taxInvoiceTitle", "number", "issuedOn", "issuer", "buyer", "taxId", "branch", "phone", "description",
  "qty", "unitPrice", "amount", "stay", "nights", "subtotal", "net", "vat", "total", "amountPaid", "balanceDue", "paymentStatus",
  "statusPaid", "statusUnpaid", "statusPending", "withholding", "paymentMethod", "bookingRef", "signature",
] as const satisfies ReadonlyArray<keyof BookingDocumentLabels>;
const PAYMENT_METHODS = ["promptpay", "cash", "transfer"] as const;

/** The issue form's rules, kept apart from the screen so they can be tested. */
export function issueFormProblem(type: BookingDocumentType, form: { name: string; address: string; taxId: string }, hotelHasTaxId: boolean) {
  if (!form.name.trim()) return "name" as const;
  if (form.taxId && !TAX_ID_PATTERN.test(form.taxId)) return "taxId" as const;
  if (type === "tax_invoice" && !hotelHasTaxId) return "hotelTaxId" as const;
  if (type === "tax_invoice" && !form.address.trim()) return "address" as const;
  return null;
}

export function useBookingDocuments(hotelId: string, booking: { id: string; guest_name: string; status?: string; payment_status?: string | null; paymentStatus?: string | null }) {
  const { t, language } = useTranslation();
  const utils = trpc.useUtils();
  const settings = trpc.bookingDocuments.settings.useQuery({ hotel_id: hotelId });
  const documents = trpc.bookingDocuments.list.useQuery({ hotel_id: hotelId, booking_id: booking.id });
  const isPaid = (booking.payment_status ?? booking.paymentStatus) === "verified";
  const [type, setType] = useState<BookingDocumentType>(isPaid ? "receipt" : "invoice");
  const [buyer, setBuyer] = useState({ name: booking.guest_name, address: "", taxId: "", branch: "" });
  const [popupBlocked, setPopupBlocked] = useState(false);

  const existingReceipt = documents.data?.find(d => d.snapshot.type === "receipt");

  const buildHtml = (doc: BookingDocumentSnapshot) => {
    const labels = Object.fromEntries(LABEL_KEYS.map(key => [key, t(`bookingDocuments.print.${key}`)])) as BookingDocumentLabels;
    const method = PAYMENT_METHODS.find(value => value === doc.booking.paymentMethod);
    return buildBookingDocumentHtml(doc, labels, language === "th" ? "th" : "en", method ? t(`bookingDocuments.print.${method}`) : null);
  };

  const printInto = (win: Window | null, doc: BookingDocumentSnapshot) => {
    const html = buildHtml(doc);
    setPopupBlocked(!writePrintWindow(win, html));
  };
  const print = (doc: BookingDocumentSnapshot) => printInto(window.open("", "_blank"), doc);

  const getPdf = trpc.bookingDocuments.getPdf.useMutation();
  const download = async (doc: BookingDocumentSnapshot, documentId?: string) => {
    try {
      const res = await getPdf.mutateAsync({
        hotel_id: hotelId,
        document_id: documentId,
        snapshot: doc,
      });
      downloadPdfBase64(res.filename, res.base64);
    } catch {
      const html = buildHtml(doc);
      downloadDocumentFile(`${doc.number}_${doc.type}.html`, html);
    }
  };

  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const issue = trpc.bookingDocuments.issue.useMutation();
  const hotelHasTaxId = Boolean(settings.data?.taxId);
  const problem = issueFormProblem(type, buyer, hotelHasTaxId);
  const submit = () => {
    if (problem) return;
    // The tab opens during the click and shows the issued snapshot once the number is taken.
    const win = window.open("", "_blank");
    issue.mutate({
      hotel_id: hotelId, booking_id: booking.id, type, buyer_name: buyer.name,
      buyer_address: buyer.address || null, buyer_tax_id: buyer.taxId || null, buyer_branch: buyer.branch || null,
      idempotency_key: idempotencyKey,
    }, {
      async onSuccess(doc) {
        setIdempotencyKey(crypto.randomUUID());
        printInto(win, doc);
        await utils.bookingDocuments.list.invalidate({ hotel_id: hotelId, booking_id: booking.id });
      },
      onError() { win?.close(); },
    });
  };
  return {
    settings, documents, type, setType, buyer, setBuyer: (patch: Partial<typeof buyer>) => setBuyer(current => ({ ...current, ...patch })),
    problem, hotelHasTaxId, issue, submit, print, download, popupBlocked, enabled: Boolean(settings.data?.enabled),
    isPaid, existingReceipt,
  };
}
