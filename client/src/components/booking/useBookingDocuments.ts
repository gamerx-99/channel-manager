import { useState } from "react";
import { BOOKING_DOCUMENT_PAYMENT_METHODS, canIssueBookingDocument, TAX_ID_PATTERN, type BookingDocumentPaymentMethod, type BookingDocumentSnapshot, type BookingDocumentType } from "@shared/bookingDocuments";
import { buildBookingDocumentHtml, writePrintWindow, type BookingDocumentLabels } from "@/lib/bookingDocumentPrint";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

const LABEL_KEYS = [
  "quotationTitle", "paymentReceiptTitle", "receiptTitle", "taxInvoiceTitle", "quotationNote", "number", "issuedOn", "issuer", "buyer", "taxId", "branch", "phone", "description",
  "amount", "stay", "nights", "subtotal", "net", "vat", "total", "withholding", "paymentMethod", "bookingRef", "signature",
] as const satisfies ReadonlyArray<keyof BookingDocumentLabels>;
const PAYMENT_METHODS = BOOKING_DOCUMENT_PAYMENT_METHODS;

/** The issue form's rules, kept apart from the screen so they can be tested. */
export function issueFormProblem(type: BookingDocumentType, form: { name: string; address: string; taxId: string }, hotelHasTaxId: boolean, paymentMethod: BookingDocumentPaymentMethod | "") {
  if (!form.name.trim()) return "name" as const;
  if (form.taxId && !TAX_ID_PATTERN.test(form.taxId)) return "taxId" as const;
  if (type === "tax_invoice" && !hotelHasTaxId) return "hotelTaxId" as const;
  if (type === "tax_invoice" && !form.address.trim()) return "address" as const;
  if (type !== "quotation" && !paymentMethod) return "paymentMethod" as const;
  return null;
}

export function useBookingDocuments(hotelId: string, booking: { id: string; guest_name: string; status: string; payment_status?: string | null }) {
  const { t, language } = useTranslation();
  const utils = trpc.useUtils();
  const settings = trpc.bookingDocuments.settings.useQuery({ hotel_id: hotelId });
  const documents = trpc.bookingDocuments.list.useQuery({ hotel_id: hotelId, booking_id: booking.id });
  const [type, setType] = useState<BookingDocumentType>(() => canIssueBookingDocument(booking) ? "receipt" : "quotation");
  const [paymentMethod, setPaymentMethod] = useState<BookingDocumentPaymentMethod | "">("");
  const [buyer, setBuyer] = useState({ name: booking.guest_name, address: "", taxId: "", branch: "" });
  const [popupBlocked, setPopupBlocked] = useState(false);

  const printInto = (win: Window | null, doc: BookingDocumentSnapshot) => {
    const labels = Object.fromEntries(LABEL_KEYS.map(key => [key, t(`bookingDocuments.print.${key}`)])) as BookingDocumentLabels;
    const method = PAYMENT_METHODS.find(value => value === doc.booking.paymentMethod);
    const html = buildBookingDocumentHtml(doc, labels, language === "th" ? "th" : "en", method ? t(`bookingDocuments.print.${method}`) : null);
    setPopupBlocked(!writePrintWindow(win, html));
  };
  const print = (doc: BookingDocumentSnapshot) => printInto(window.open("", "_blank"), doc);

  const issue = trpc.bookingDocuments.issue.useMutation();
  const hotelHasTaxId = Boolean(settings.data?.taxId);
  const problem = issueFormProblem(type, buyer, hotelHasTaxId, paymentMethod);
  const submit = () => {
    if (problem) return;
    // The tab opens during the click and shows the issued snapshot once the number is taken.
    const win = window.open("", "_blank");
    issue.mutate({
      hotel_id: hotelId, booking_id: booking.id, type, buyer_name: buyer.name,
      buyer_address: buyer.address || null, buyer_tax_id: buyer.taxId || null, buyer_branch: buyer.branch || null,
      payment_method: paymentMethod || null,
    }, {
      async onSuccess(doc) {
        printInto(win, doc);
        await utils.bookingDocuments.list.invalidate({ hotel_id: hotelId, booking_id: booking.id });
      },
      onError() { win?.close(); },
    });
  };
  return {
    settings, documents, type, setType, buyer, paymentMethod, setPaymentMethod,
    paymentMethods: PAYMENT_METHODS,
    setBuyer: (patch: Partial<typeof buyer>) => setBuyer(current => ({ ...current, ...patch })),
    problem, hotelHasTaxId, issue, submit, print, popupBlocked, enabled: Boolean(settings.data?.enabled),
  };
}
