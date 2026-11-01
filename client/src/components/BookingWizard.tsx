import { FormEvent, useMemo, useState } from 'react';
import { X, UserRoundPlus, Calendar, Bed, ListPlus, ReceiptText } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatIsoToDisplayDate, parseDisplayDateToIso } from '@shared/dateUtils';
import type { BookingServiceInput, PricingModel } from '@shared/pricingModels';
import { calcNights, calculateGrandTotal, calculateServiceTotal } from '@shared/pricingModels';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { availableRoomsForStay } from '@/lib/roomAvailability';

const PRICING_MODEL_KEYS: Record<PricingModel, TranslationKey> = {
  ONE_TIME: 'bookingWizard.modelOneTime',
  PER_NIGHT: 'bookingWizard.modelPerNight',
  PER_PERSON_PER_NIGHT: 'bookingWizard.modelPerPersonPerNight',
};

function displayDay(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

const formatCurrency = (value: number | string) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(Number(value));

interface HotelData {
  id: string;
  rooms: { id: string; room_number: string; room_type_id: string; status: string }[];
  room_types: { id: string; name: string; base_price: number | string }[];
  bookings: { id: string; room_id?: string | null; check_in: string; check_out: string; status: string }[];
}

export default function BookingWizard({
  hotel,
  onClose,
  onSuccess,
}: {
  hotel: HotelData;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const sourceLabel = { manual: t('bookingWizard.sourceManual'), 'walk-in': t('bookingWizard.sourceWalkIn'), phone: t('bookingWizard.sourcePhone') };
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [formError, setFormError] = useState<string | null>(null);

  const [checkIn, setCheckIn] = useState(displayDay(1));
  const [checkOut, setCheckOut] = useState(displayDay(2));
  const [pickedRoomId, setRoomId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [source, setSource] = useState<'manual' | 'walk-in' | 'phone'>('manual');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'promptpay' | ''>('');

  const [services, setServices] = useState<BookingServiceInput[]>([]);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceModel, setNewServiceModel] = useState<PricingModel>('ONE_TIME');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newServiceQty, setNewServiceQty] = useState('1');

  const [guest, setGuest] = useState({
    first_name: '',
    last_name: '',
    passport_no: '',
    nationality_code: '',
    gender: '' as '' | 'M' | 'F',
    birth_date: '',
    phone_no: '',
  });

  const createBooking = trpc.channelManager.createBooking.useMutation({
    onSuccess: () => {
      onSuccess();
    },
    onError: error => setFormError(error.message),
  });

  const checkInIso = useMemo(() => {
    try { return parseDisplayDateToIso(checkIn); } catch { return ''; }
  }, [checkIn]);

  const checkOutIso = useMemo(() => {
    try { return parseDisplayDateToIso(checkOut); } catch { return ''; }
  }, [checkOut]);

  const numberOfNights = useMemo(() => {
    if (!checkInIso || !checkOutIso) return 0;
    return calcNights(checkInIso, checkOutIso);
  }, [checkInIso, checkOutIso]);

  const availableRooms = useMemo(
    () => availableRoomsForStay(hotel.rooms, hotel.bookings, checkInIso, checkOutIso),
    [hotel.rooms, hotel.bookings, checkInIso, checkOutIso],
  );
  // A room picked earlier stops counting once new dates make it unavailable.
  const roomId = availableRooms.some(room => room.id === pickedRoomId) ? pickedRoomId : '';

  const selectedRoom = hotel.rooms.find(r => r.id === roomId);
  const roomType = selectedRoom ? hotel.room_types.find(rt => rt.id === selectedRoom.room_type_id) : null;
  const roomBasePrice = roomType ? Number(roomType.base_price) : 0;
  
  const grandTotal = calculateGrandTotal(roomBasePrice, numberOfNights, services);

  const addService = () => {
    if (!newServiceName.trim() || !newServicePrice) return;
    setServices([...services, {
      service_name: newServiceName.trim(),
      pricing_model: newServiceModel,
      unit_price: Number(newServicePrice),
      quantity: Math.max(1, Number(newServiceQty)),
    }]);
    setNewServiceName('');
    setNewServicePrice('');
    setNewServiceQty('1');
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const submitBooking = () => {
    setFormError(null);
    if (!roomId) { setFormError(t('bookingWizard.errorSelectRoom')); return; }
    if (!guestName.trim()) { setFormError(t('bookingWizard.errorGuestName')); return; }
    if (source === 'walk-in' && !paymentMethod) { setFormError(t('bookingWizard.errorPaymentMethod')); return; }

    const hasGuestDetails = Boolean(
      guest.first_name || guest.last_name || guest.passport_no || guest.nationality_code || guest.gender || guest.birth_date,
    );
    const requiredGuestFields = [guest.first_name, guest.last_name, guest.passport_no, guest.nationality_code, guest.gender, guest.birth_date];
    if (hasGuestDetails && requiredGuestFields.some(value => !value.trim())) {
      setFormError(t('bookingWizard.errorTm30Fields'));
      return;
    }

    createBooking.mutate({
      hotel_id: hotel.id,
      room_id: roomId || null,
      guest_name: guestName,
      check_in: checkInIso,
      check_out: checkOutIso,
      price: grandTotal,
      source: source,
      payment_method: paymentMethod || undefined,
      status: 'confirmed',
      guests: hasGuestDetails ? [{
        ...guest,
        gender: guest.gender as 'M'|'F',
        birth_date: parseDisplayDateToIso(guest.birth_date),
      }] : [],
      services,
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" style={{ maxWidth: '600px' }} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">{t('bookingWizard.eyebrow', { step })}</div>
            <h2>
              {step === 1 && t('bookingWizard.step1')}
              {step === 2 && t('bookingWizard.step2')}
              {step === 3 && t('bookingWizard.step3')}
              {step === 4 && t('bookingWizard.step4')}
            </h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t('bookingWizard.close')}><X size={17} /></button>
        </div>

        {formError && <p className="form-error" role="alert">{formError}</p>}

        <div className="wizard-content" style={{ minHeight: '300px' }}>
          {step === 1 && (
            <div className="form-grid">
              <label>{t('bookingWizard.checkIn')}<input required placeholder="DD/MM/YYYY" value={checkIn} onChange={e => setCheckIn(e.target.value)} /></label>
              <label>{t('bookingWizard.checkOut')}<input required placeholder="DD/MM/YYYY" value={checkOut} onChange={e => setCheckOut(e.target.value)} /></label>
              
              <div style={{ gridColumn: '1 / -1' }} className="tm30-callout">
                {numberOfNights > 0 ? <strong>{t('bookingWizard.nightsSelected', { count: numberOfNights })}</strong> : <strong style={{ color: 'red' }}>{t('bookingWizard.invalidDates')}</strong>}
              </div>

              <label>{t('bookingWizard.primaryGuest')}<input required value={guestName} onChange={e => setGuestName(e.target.value)} placeholder={t('bookingWizard.fullNamePlaceholder')} /></label>
              <label>{t('bookingWizard.source')}<select value={source} onChange={e => setSource(e.target.value as any)}><option value="manual">{sourceLabel.manual}</option><option value="walk-in">{sourceLabel['walk-in']}</option><option value="phone">{sourceLabel.phone}</option></select></label>
              {source === 'walk-in' && (
                <label>{t('bookingWizard.paymentMethod')}<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)}>
                  <option value="">{t('bookingWizard.selectPaymentMethod')}</option>
                  <option value="cash">{t('bookingWizard.cash')}</option>
                  <option value="transfer">{t('bookingWizard.bankTransfer')}</option>
                  <option value="promptpay">PromptPay</option>
                </select></label>
              )}

              <label style={{ gridColumn: '1 / -1' }}>{t('bookingWizard.room')}
                <select value={roomId} onChange={e => setRoomId(e.target.value)}>
                  <option value="">{t('bookingWizard.selectRoom')}</option>
                  {availableRooms.map(room => {
                    const rt = hotel.room_types.find(type => type.id === room.room_type_id);
                    return <option key={room.id} value={room.id}>{t('bookingWizard.roomOption', { room: room.room_number, type: rt?.name ?? '', price: formatCurrency(rt?.base_price ?? 0) })}</option>
                  })}
                </select>
              </label>
            </div>
          )}

          {step === 2 && (
            <div>
              <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#555' }}>{t('bookingWizard.servicesHint')}</p>
              
              {services.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <table className="data-table">
                    <thead><tr><th>{t('bookingWizard.colService')}</th><th>{t('bookingWizard.colModel')}</th><th>{t('bookingWizard.colTotal')}</th><th/></tr></thead>
                    <tbody>
                      {services.map((s, i) => (
                        <tr key={i}>
                          <td>{s.service_name}</td>
                          <td>{t(PRICING_MODEL_KEYS[s.pricing_model])}</td>
                          <td>{formatCurrency(calculateServiceTotal(s, numberOfNights))}</td>
                          <td><button type="button" onClick={() => removeService(i)} className="text-link" style={{color:'red'}} aria-label={t('bookingWizard.removeService')}><X size={14}/></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="form-grid" style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '8px' }}>
                <label style={{ gridColumn: '1/-1' }}>{t('bookingWizard.serviceName')}<input value={newServiceName} onChange={e => setNewServiceName(e.target.value)} placeholder={t('bookingWizard.serviceNamePlaceholder')} /></label>
                <label>{t('bookingWizard.pricingModel')}
                  <select value={newServiceModel} onChange={e => setNewServiceModel(e.target.value as PricingModel)}>
                    <option value="ONE_TIME">{t(PRICING_MODEL_KEYS.ONE_TIME)}</option>
                    <option value="PER_NIGHT">{t(PRICING_MODEL_KEYS.PER_NIGHT)}</option>
                    <option value="PER_PERSON_PER_NIGHT">{t(PRICING_MODEL_KEYS.PER_PERSON_PER_NIGHT)}</option>
                  </select>
                </label>
                <label>{t('bookingWizard.unitPrice')}<input type="number" min="0" value={newServicePrice} onChange={e => setNewServicePrice(e.target.value)} /></label>
                <label>{t('bookingWizard.quantity')}<input type="number" min="1" value={newServiceQty} onChange={e => setNewServiceQty(e.target.value)} /></label>
                <div style={{ gridColumn: '1/-1' }}>
                  <button type="button" className="button button-quiet" onClick={addService}>{t('bookingWizard.addService')}</button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="guest-form-divider" style={{ marginTop: 0 }}><UserRoundPlus size={16} /><span>{t('bookingWizard.tm30Title')}</span><small>{t('bookingWizard.tm30Hint')}</small></div>
              <div className="form-grid">
                <label>{t('bookingWizard.firstName')}<input value={guest.first_name} onChange={e => setGuest({ ...guest, first_name: e.target.value })} placeholder={t('bookingWizard.firstNamePlaceholder')} /></label>
                <label>{t('bookingWizard.lastName')}<input value={guest.last_name} onChange={e => setGuest({ ...guest, last_name: e.target.value })} placeholder={t('bookingWizard.lastNamePlaceholder')} /></label>
                <label>{t('bookingWizard.passportNo')}<input value={guest.passport_no} onChange={e => setGuest({ ...guest, passport_no: e.target.value })} placeholder={t('bookingWizard.passportPlaceholder')} /></label>
                <label>{t('bookingWizard.nationality')}<input value={guest.nationality_code} onChange={e => setGuest({ ...guest, nationality_code: e.target.value.toUpperCase() })} placeholder={t('bookingWizard.nationalityPlaceholder')} maxLength={3} /></label>
                <label>{t('bookingWizard.birthDate')}<input placeholder="DD/MM/YYYY" value={guest.birth_date} onChange={e => setGuest({ ...guest, birth_date: e.target.value })} /></label>
                <label>{t('bookingWizard.phone')}<input value={guest.phone_no} onChange={e => setGuest({ ...guest, phone_no: e.target.value })} placeholder={t('bookingWizard.optional')} /></label>
                <label>{t('bookingWizard.gender')}<select value={guest.gender} onChange={e => setGuest({...guest, gender: e.target.value as any})}><option value="">{t('bookingWizard.select')}</option><option value="M">{t('bookingWizard.male')}</option><option value="F">{t('bookingWizard.female')}</option></select></label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="summary-panel" style={{ background: '#fafafa', padding: '1rem', borderRadius: '8px' }}>
              <h3 style={{ marginBottom: '1rem' }}>{t('bookingWizard.summaryTitle')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                <div><strong>{t('bookingWizard.summaryGuest')}</strong> {guestName}</div>
                <div><strong>{t('bookingWizard.summaryStay')}</strong> {checkIn} - {checkOut} ({t('bookingWizard.nights', { count: numberOfNights })})</div>
                <div><strong>{t('bookingWizard.summaryRoom')}</strong> {selectedRoom?.room_number ?? t('bookingWizard.unassigned')} ({roomType?.name})</div>
                <div><strong>{t('bookingWizard.summarySource')}</strong> {sourceLabel[source]}</div>
              </div>
              
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>{t('bookingWizard.roomRate', { count: numberOfNights, price: formatCurrency(roomBasePrice) })}</td>
                    <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatCurrency(roomBasePrice * numberOfNights)}</td>
                  </tr>
                  {services.map((s, i) => (
                    <tr key={i}>
                      <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>{s.service_name} ({s.quantity}x {t(PRICING_MODEL_KEYS[s.pricing_model])})</td>
                      <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatCurrency(calculateServiceTotal(s, numberOfNights))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: '1rem 0', fontWeight: 'bold' }}>{t('bookingWizard.grandTotal')}</td>
                    <td style={{ padding: '1rem 0', fontWeight: 'bold', textAlign: 'right', fontSize: '1.1rem' }}>{formatCurrency(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between', marginTop: '2rem' }}>
          {step > 1 ? (
            <button className="button button-quiet" type="button" onClick={() => setStep((s) => (s - 1) as any)}>{t('bookingWizard.back')}</button>
          ) : (
            <button className="button button-quiet" type="button" onClick={onClose}>{t('bookingWizard.cancel')}</button>
          )}
          
          {step < 4 ? (
            <button className="button button-primary" type="button" onClick={() => {
              if (step === 1 && (!roomId || !guestName || numberOfNights <= 0)) {
                setFormError(t('bookingWizard.errorRequired'));
                return;
              }
              setFormError(null);
              setStep((s) => (s + 1) as any);
            }}>{t('bookingWizard.continue')}</button>
          ) : (
            <button className="button button-primary" type="button" onClick={submitBooking} disabled={createBooking.isPending}>
              {createBooking.isPending ? t('bookingWizard.saving') : t('bookingWizard.confirm')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
