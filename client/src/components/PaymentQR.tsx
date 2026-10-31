import { useState, useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { generateQrDataUrl } from '../lib/qr';

interface PaymentQRProps {
  bookingId: string;
  hotelId: string;
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
export function PaymentQR({ bookingId, hotelId, onSuccess, onExpired }: PaymentQRProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number>(0);
  const [tab, setTab] = useState<'qr' | 'slip'>('qr');
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipError, setSlipError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const createSession = trpc.payment.createSession.useMutation({
    onSuccess(data) {
      setSessionId(data.sessionId);
      // Drawn locally from the EMVCo payload; the PromptPay ID and amount are
      // not sent to an outside QR image service.
      setQrImageUrl(data.qrString ? generateQrDataUrl(data.qrString) : null);
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
      } else {
        setSlipError(data.message);
      }
    },
    onError(err) {
      setVerifying(false);
      setSlipError(err.message);
    },
  });

  // Create session on mount
  useEffect(() => {
    createSession.mutate({ booking_id: bookingId, hotel_id: hotelId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, hotelId]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, ms));
      if (ms <= 0) onExpired();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpired]);

  // React to polled status
  useEffect(() => {
    const status = checkStatus.data?.status;
    if (status === 'paid') onSuccess();
    if (status === 'expired' || status === 'failed') onExpired();
  }, [checkStatus.data, onSuccess, onExpired]);

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function handleSlipUpload() {
    if (!slipFile || !sessionId) return;
    setSlipError(null);
    setVerifying(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      verifySlipMutation.mutate({
        booking_id: bookingId,
        hotel_id: hotelId,
        session_id: sessionId,
        slip_data: base64,
      });
    };
    reader.readAsDataURL(slipFile);
  }

  const isExpired = remaining <= 0 && !!expiresAt;

  if (createSession.isPending) {
    return (
      <div className="payment-qr payment-qr--loading" aria-live="polite">
        <div className="payment-spinner" aria-label="กำลังสร้าง QR Code..." />
        <p>กำลังสร้าง QR Code...</p>
      </div>
    );
  }

  if (createSession.isError) {
    return (
      <div className="payment-qr payment-qr--error" role="alert">
        <p className="payment-error-msg">{createSession.error.message}</p>
        <p className="payment-error-sub">กรุณาติดต่อที่พักโดยตรง</p>
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
              {qrImageUrl && (
                <img
                  src={qrImageUrl}
                  alt="QR Code สำหรับชำระเงินผ่าน PromptPay"
                  className="payment-qr-image"
                  width={300}
                  height={300}
                />
              )}
              <p className="payment-qr-hint">สแกนด้วยแอปธนาคารเพื่อชำระเงิน</p>
              <p className="payment-qr-hint payment-qr-hint--sub">ระบบจะตรวจสอบการชำระเงินอัตโนมัติ</p>
            </div>
          )}

          {tab === 'slip' && (
            <div id="panel-slip" role="tabpanel" aria-labelledby="tab-slip" className="payment-slip-panel">
              <p className="payment-slip-instruction">ชำระเงินแล้ว? อัปโหลดสลิปเพื่อยืนยัน</p>
              <label className="payment-slip-upload-label" htmlFor="slip-file-input">
                <input
                  id="slip-file-input"
                  type="file"
                  accept="image/*"
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
