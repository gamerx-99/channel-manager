import { useState, useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { generateQrDataUrl } from '../lib/qr';
import { useTranslation } from '../lib/i18n';
import { localizeServerMessage } from '../lib/serverErrors';
import HotelContactsList from './hotel/HotelContactsList';
import './PaymentQR.css';

interface PaymentQRProps {
  bookingId: string;
  hotelId: string;
  hotelPhone?: string | null;
  hotelFacebookUrl?: string | null;
  onSuccess: () => void;
  onExpired: () => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const sec = (totalSec % 60).toString().padStart(2, '0');
  return `${min}:${sec}`;
}

/**
 * Phase 12B — PromptPay QR Payment component.
 *
 * 1. Calls payment.createSession on mount to get QR image URL + expiresAt.
 * 2. Shows QR image + countdown timer.
 * 3. Polls checkStatus every 10 seconds to detect payment.
 * 4. On success → calls onSuccess(); on expire → calls onExpired().
 * 5. Shows SlipUpload tab for manual slip submission.
 */
export function PaymentQR({ bookingId, hotelId, hotelPhone, hotelFacebookUrl, onSuccess, onExpired }: PaymentQRProps) {
  const { t, language } = useTranslation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrReadiness, setQrReadiness] = useState<'ready' | 'missing-payload' | 'render-failed'>('missing-payload');
  const [amount, setAmount] = useState<number>(0);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number>(0);
  const [tab, setTab] = useState<'qr' | 'slip'>('qr');
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipError, setSlipError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  // The slip reached staff review: the QR timer no longer applies.
  const [underReview, setUnderReview] = useState(false);
  const [slipRejected, setSlipRejected] = useState(false);
  const [verificationIssue, setVerificationIssue] = useState(false);
  const contactRequired = underReview || slipRejected || verificationIssue;
  const normalisedPhone = hotelPhone?.replace(/[^\d+]/g, '') ?? '';
  const phone = /\d/.test(normalisedPhone) ? normalisedPhone : null;
  let facebookUrl: string | null = null;
  try {
    const parsed = new URL(hotelFacebookUrl ?? '');
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') facebookUrl = parsed.href;
  } catch { /* Unset/invalid public links are not displayed. */ }
  const contactLinks = <>
    <HotelContactsList phone={phone} facebookUrl={facebookUrl} />
    {!phone && !facebookUrl && <p>{t('publicHotel.paymentContactUnavailable')}</p>}
  </>;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const createSession = trpc.payment.createSession.useMutation({
    onSuccess(data) {
      setSessionId(data.sessionId);
      // Draw locally from the EMVCo payload; never send payment data to an
      // outside QR image service. Keep failures visible instead of showing an
      // apparently ready payment screen with a blank QR.
      if (!data.qrString?.trim()) {
        setQrImageUrl(null);
        setQrReadiness('missing-payload');
      } else {
        try {
          setQrImageUrl(generateQrDataUrl(data.qrString));
          setQrReadiness('ready');
        } catch {
          setQrImageUrl(null);
          setQrReadiness('render-failed');
        }
      }
      setAmount(data.amount);
      setExpiresAt(data.expiresAt);
    },
  });

  const checkStatus = trpc.payment.checkStatus.useQuery(
    { booking_id: bookingId, session_id: sessionId ?? '' },
    {
      enabled: !!sessionId,
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
    },
  );

  const verifySlipMutation = trpc.payment.verifySlip.useMutation({
    onSuccess(data) {
      setVerifying(false);
      if (data.verified) {
        onSuccess();
      } else if ('pendingManualReview' in data && data.pendingManualReview) {
        setUnderReview(true);
      } else if ('retrySlip' in data && data.retrySlip) {
        setVerificationIssue(true);
      } else {
        setSlipRejected(true);
      }
    },
    onError() {
      setVerifying(false);
      setVerificationIssue(true);
    },
  });

  // Create session on mount
  useEffect(() => {
    createSession.mutate({ booking_id: bookingId, hotel_id: hotelId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, hotelId]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt || contactRequired) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, ms));
      if (ms <= 0) onExpired();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpired, contactRequired]);

  // React to polled status
  useEffect(() => {
    const status = checkStatus.data?.status;
    if (status === 'paid') onSuccess();
    if (status === 'under_review') setUnderReview(true);
    if (status === 'failed') setSlipRejected(true);
    if (status === 'expired' && !contactRequired) onExpired();
  }, [checkStatus.data, onSuccess, onExpired, contactRequired]);

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function handleSlipUpload() {
    if (!slipFile || !sessionId) return;
    setSlipError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(slipFile.type)) {
      setSlipError(t('publicHotel.paymentSlipTypeError'));
      return;
    }
    if (slipFile.size === 0 || slipFile.size > 3_500_000) {
      setSlipError(t('publicHotel.paymentSlipSizeError'));
      return;
    }
    setVerifying(true);
    const reader = new FileReader();
    const readFailed = () => {
      setVerifying(false);
      setSlipError(t('publicHotel.paymentSlipReadError'));
    };
    reader.onerror = readFailed;
    reader.onabort = readFailed;
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      verifySlipMutation.mutate({
        booking_id: bookingId,
        hotel_id: hotelId,
        session_id: sessionId,
        slip_data: base64,
        slip_content_type: slipFile.type as 'image/jpeg' | 'image/png' | 'image/webp',
      });
    };
    try {
      reader.readAsDataURL(slipFile);
    } catch {
      readFailed();
    }
  }

  const isExpired = remaining <= 0 && !!expiresAt;

  if (contactRequired) {
    return (
      <div className="payment-qr payment-qr--error payment-slip-result" role="status" aria-live="polite">
        <h3 className="payment-error-msg">{t(slipRejected ? 'publicHotel.paymentRejectedTitle' : 'publicHotel.paymentUnderReviewTitle')}</h3>
        <p className="payment-error-sub">{t(slipRejected ? 'publicHotel.paymentRejectedDesc' : 'publicHotel.paymentUnderReviewDesc')}</p>
        <p>{t('publicHotel.paymentContactBookingReference', { reference: bookingId.slice(0, 8).toUpperCase() })}</p>
        {contactLinks}
      </div>
    );
  }

  if (createSession.isPending) {
    return (
      <div className="payment-qr payment-qr--loading" aria-live="polite">
        <div className="payment-spinner" aria-label="กำลังสร้าง QR Code..." />
        <p>กำลังสร้าง QR Code...</p>
      </div>
    );
  }

  if (createSession.isError) {
    const message = localizeServerMessage(createSession.error.message, language);
    const contactIncluded = message === t('serverErrors.promptPayUnavailable') || message.includes(t('bookingPayment.contactProperty'));
    return (
      <div className="payment-qr payment-qr--error" role="alert">
        <p className="payment-error-msg">{message}</p>
        {!contactIncluded && <p className="payment-error-sub">{t('bookingPayment.contactProperty')}</p>}
        {contactLinks}
      </div>
    );
  }

  return (
    <div className="payment-qr">
      <div className="payment-qr-header">
        <div className="payment-amount">
          <span className="payment-amount-label">ยอดชำระ</span>
          <strong className="payment-amount-value">฿{amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>
        </div>
        <div className={`payment-countdown ${remaining < 60_000 ? 'payment-countdown--urgent' : ''}`} aria-live="polite" aria-atomic="true">
          {isExpired ? (
            <span className="payment-expired-label">หมดเวลา</span>
          ) : (
            <>
              <span className="payment-countdown-label">เหลือเวลา</span>
              <span className="payment-countdown-value" aria-label={`${formatCountdown(remaining)} นาที`}>{formatCountdown(remaining)}</span>
            </>
          )}
        </div>
      </div>

      {isExpired ? (
        <div className="payment-qr-expired" role="alert">
          <p>QR Code หมดอายุแล้ว</p>
          <p className="payment-error-sub">กรุณาติดต่อที่พักเพื่อดำเนินการต่อ</p>
        </div>
      ) : (
        <>
          <nav className="payment-tabs" role="tablist" aria-label="วิธีชำระเงิน">
            <button
              role="tab"
              aria-selected={tab === 'qr'}
              id="tab-qr"
              aria-controls="panel-qr"
              className={`payment-tab ${tab === 'qr' ? 'payment-tab--active' : ''}`}
              onClick={() => setTab('qr')}
            >
              QR Code
            </button>
            <button
              role="tab"
              aria-selected={tab === 'slip'}
              id="tab-slip"
              aria-controls="panel-slip"
              className={`payment-tab ${tab === 'slip' ? 'payment-tab--active' : ''}`}
              onClick={() => setTab('slip')}
            >
              อัปโหลดสลิป
            </button>
          </nav>

          {tab === 'qr' && (
            <div id="panel-qr" role="tabpanel" aria-labelledby="tab-qr" className="payment-qr-panel">
              {qrImageUrl && qrReadiness === 'ready' ? (
                <img
                  src={qrImageUrl}
                  alt="QR Code สำหรับชำระเงินผ่าน PromptPay"
                  className="payment-qr-image"
                  width={300}
                  height={300}
                  onError={() => {
                    setQrImageUrl(null);
                    setQrReadiness('render-failed');
                  }}
                />
              ) : (
                <p className="payment-error-sub" role="alert" aria-live="polite">
                  {qrReadiness === 'missing-payload'
                    ? t('publicHotel.paymentQrMissingPayload')
                    : t('publicHotel.paymentQrRenderFailure')}
                </p>
              )}
              {qrReadiness === 'ready' && <>
                <p className="payment-qr-hint">{t('publicHotel.paymentQrScanHint')}</p>
                <p className="payment-qr-hint payment-qr-hint--sub">{t('publicHotel.paymentQrUploadHint')}</p>
              </>}
            </div>
          )}

          {tab === 'slip' && (
            <div id="panel-slip" role="tabpanel" aria-labelledby="tab-slip" className="payment-slip-panel">
              <p className="payment-slip-instruction">ชำระเงินแล้ว? อัปโหลดสลิปเพื่อยืนยัน</p>
              <label className="payment-slip-upload-label" htmlFor="slip-file-input">
                <input
                  id="slip-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    setSlipFile(e.target.files?.[0] ?? null);
                    setSlipError(null);
                  }}
                  className="payment-slip-file-input"
                  aria-label="เลือกไฟล์รูปสลิปการโอนเงิน"
                />
                {slipFile ? (
                  <span className="payment-slip-filename">{slipFile.name}</span>
                ) : (
                  <span className="payment-slip-placeholder">กดเพื่อเลือกรูปสลิป</span>
                )}
              </label>
              {slipError && (
                <p className="payment-slip-error" role="alert">{slipError}</p>
              )}
              <button
                className="button button-primary payment-slip-submit"
                onClick={handleSlipUpload}
                disabled={!slipFile || verifying}
                aria-busy={verifying}
              >
                {verifying ? 'กำลังตรวจสอบ...' : 'ยืนยันการชำระเงิน'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
