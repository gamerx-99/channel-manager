import { FormEvent, useMemo, useState } from 'react';
import { X, UserRoundPlus, Calendar, Bed, ListPlus, ReceiptText } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatIsoToDisplayDate, parseDisplayDateToIso } from '@shared/dateUtils';
import type { BookingServiceInput, PricingModel } from '@shared/pricingModels';
import { calcNights, calculateGrandTotal, calculateServiceTotal } from '@shared/pricingModels';

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
  room_types: { id: string; name: string; base_price: number | string; base_occupancy: number; child_rule: 'age' | 'height' }[];
  bookings: { id: string; check_in: string; check_out: string; status: string }[];
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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [formError, setFormError] = useState<string | null>(null);

  const [checkIn, setCheckIn] = useState(displayDay(1));
  const [checkOut, setCheckOut] = useState(displayDay(2));
  const [roomId, setRoomId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState<string[]>([]);
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

  const availableRooms = useMemo(() => {
    if (!checkInIso || !checkOutIso || checkInIso >= checkOutIso) return [];
    return hotel.rooms.filter(room => {
      if (room.status === 'out_of_service') return false;
      const hasOverlap = hotel.bookings.some(b => {
        if (b.status === 'cancelled') return false;
        return b.check_in < checkOutIso && b.check_out > checkInIso;
      });
      return !hasOverlap;
    });
  }, [hotel.rooms, hotel.bookings, checkInIso, checkOutIso]);

  const selectedRoom = hotel.rooms.find(r => r.id === roomId);
  const roomType = selectedRoom ? hotel.room_types.find(rt => rt.id === selectedRoom.room_type_id) : null;
  const roomBasePrice = roomType ? Number(roomType.base_price) : 0;
  const childMeasure = roomType?.child_rule === 'height' ? 'height (cm)' : 'age';
  
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
    if (!roomId) { setFormError("Select a room first."); return; }
    if (!guestName.trim()) { setFormError("Enter primary guest name."); return; }
    const minChildMeasurement = roomType?.child_rule === 'height' ? 20 : 0;
    const maxChildMeasurement = roomType?.child_rule === 'height' ? 250 : 17;
    if (adults < 1 || adults > 20 || children.length > 20 || children.some(value => value === '' || !Number.isFinite(Number(value)) || Number(value) < minChildMeasurement || Number(value) > maxChildMeasurement || (roomType?.child_rule !== 'height' && !Number.isInteger(Number(value))))) {
      setFormError('Enter a valid adult count and a measurement for every child.'); return;
    }
    if (source === 'walk-in' && !paymentMethod) { setFormError('Select a payment method for walk-in bookings.'); return; }

    const hasGuestDetails = Boolean(
      guest.first_name || guest.last_name || guest.passport_no || guest.nationality_code || guest.gender || guest.birth_date,
    );
    const requiredGuestFields = [guest.first_name, guest.last_name, guest.passport_no, guest.nationality_code, guest.gender, guest.birth_date];
    if (hasGuestDetails && requiredGuestFields.some(value => !value.trim())) {
      setFormError('Enter all TM.30 identity fields, or leave the entire guest identity section blank.');
      return;
    }

    createBooking.mutate({
      hotel_id: hotel.id,
      room_id: roomId || null,
      guest_name: guestName,
      check_in: checkInIso,
      check_out: checkOutIso,
      adults,
      children: children.map(value => roomType?.child_rule === 'height' ? { height_cm: Number(value) } : { age: Number(value) }),
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
            <div className="eyebrow">Booking Wizard (Step {step} of 4)</div>
            <h2>
              {step === 1 && 'Dates & Room'}
              {step === 2 && 'Additional Services'}
              {step === 3 && 'Guest Information'}
              {step === 4 && 'Summary'}
            </h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}><X size={17} /></button>
        </div>

        {formError && <p className="form-error" role="alert">{formError}</p>}

        <div className="wizard-content" style={{ minHeight: '300px' }}>
          {step === 1 && (
            <div className="form-grid">
              <label>Check-in (DD/MM/YYYY)<input required placeholder="DD/MM/YYYY" value={checkIn} onChange={e => setCheckIn(e.target.value)} /></label>
              <label>Check-out (DD/MM/YYYY)<input required placeholder="DD/MM/YYYY" value={checkOut} onChange={e => setCheckOut(e.target.value)} /></label>
              
              <div style={{ gridColumn: '1 / -1' }} className="tm30-callout">
                {numberOfNights > 0 ? <strong>{numberOfNights} Nights Selected</strong> : <strong style={{ color: 'red' }}>Invalid dates</strong>}
              </div>

              <label>Primary Guest Name<input required value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Full name" /></label>
              <label>Booking Source<select value={source} onChange={e => setSource(e.target.value as any)}><option value="manual">Manual</option><option value="walk-in">Walk-in</option><option value="phone">Phone</option></select></label>
              <label>Adults<input type="number" min="1" max="20" step="1" value={adults} onChange={e => setAdults(Math.max(1, Number(e.target.value) || 1))} /></label>
              <label>Children<input type="number" min="0" max="20" step="1" value={children.length} onChange={e => setChildren(Array.from({ length: Math.max(0, Math.min(20, Number(e.target.value) || 0)) }, (_, index) => children[index] ?? ''))} /></label>
              {children.map((value, index) => <label key={index}>Child {index + 1} {childMeasure}<input type="number" min={roomType?.child_rule === 'height' ? 20 : 0} max={roomType?.child_rule === 'height' ? 250 : 17} step={roomType?.child_rule === 'height' ? '0.5' : '1'} value={value} onChange={e => setChildren(current => current.map((child, childIndex) => childIndex === index ? e.target.value : child))} /></label>)}
              {source === 'walk-in' && (
                <label>Payment Method<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)}>
                  <option value="">Select payment method</option>
                  <option value="cash">Cash</option>
                  <option value="transfer">Bank transfer</option>
                  <option value="promptpay">PromptPay</option>
                </select></label>
              )}

              <label style={{ gridColumn: '1 / -1' }}>Room Assignment
                <select value={roomId} onChange={e => setRoomId(e.target.value)}>
                  <option value="">Select an available room</option>
                  {availableRooms.map(room => {
                    const rt = hotel.room_types.find(t => t.id === room.room_type_id);
                    return <option key={room.id} value={room.id}>{room.room_number} · {rt?.name} ({formatCurrency(rt?.base_price ?? 0)}/night)</option>
                  })}
                </select>
              </label>
            </div>
          )}

          {step === 2 && (
            <div>
              <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#555' }}>Add optional services (e.g., extra bed, breakfast, airport transfer).</p>
              
              {services.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <table className="data-table">
                    <thead><tr><th>Service</th><th>Model</th><th>Total</th><th/></tr></thead>
                    <tbody>
                      {services.map((s, i) => (
                        <tr key={i}>
                          <td>{s.service_name}</td>
                          <td>{s.pricing_model}</td>
                          <td>{formatCurrency(calculateServiceTotal(s, numberOfNights))}</td>
                          <td><button type="button" onClick={() => removeService(i)} className="text-link" style={{color:'red'}}><X size={14}/></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="form-grid" style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '8px' }}>
                <label style={{ gridColumn: '1/-1' }}>Service Name<input value={newServiceName} onChange={e => setNewServiceName(e.target.value)} placeholder="e.g. Extra Bed" /></label>
                <label>Pricing Model
                  <select value={newServiceModel} onChange={e => setNewServiceModel(e.target.value as PricingModel)}>
                    <option value="ONE_TIME">One Time</option>
                    <option value="PER_NIGHT">Per Night</option>
                    <option value="PER_PERSON_PER_NIGHT">Per Person Per Night</option>
                  </select>
                </label>
                <label>Unit Price (THB)<input type="number" min="0" value={newServicePrice} onChange={e => setNewServicePrice(e.target.value)} /></label>
                <label>Quantity<input type="number" min="1" value={newServiceQty} onChange={e => setNewServiceQty(e.target.value)} /></label>
                <div style={{ gridColumn: '1/-1' }}>
                  <button type="button" className="button button-quiet" onClick={addService}>+ Add Service</button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="guest-form-divider" style={{ marginTop: 0 }}><UserRoundPlus size={16} /><span>Guest identity for TM.30</span><small>Optional now · required before export</small></div>
              <div className="form-grid">
                <label>First name<input value={guest.first_name} onChange={e => setGuest({ ...guest, first_name: e.target.value })} placeholder="Given name" /></label>
                <label>Last name<input value={guest.last_name} onChange={e => setGuest({ ...guest, last_name: e.target.value })} placeholder="Surname" /></label>
                <label>Passport no.<input value={guest.passport_no} onChange={e => setGuest({ ...guest, passport_no: e.target.value })} placeholder="Passport number" /></label>
                <label>Nationality code<input value={guest.nationality_code} onChange={e => setGuest({ ...guest, nationality_code: e.target.value.toUpperCase() })} placeholder="ISO country code" maxLength={3} /></label>
                <label>Birth date (DD/MM/YYYY)<input placeholder="DD/MM/YYYY" value={guest.birth_date} onChange={e => setGuest({ ...guest, birth_date: e.target.value })} /></label>
                <label>Phone no.<input value={guest.phone_no} onChange={e => setGuest({ ...guest, phone_no: e.target.value })} placeholder="Optional" /></label>
                <label>Gender<select value={guest.gender} onChange={e => setGuest({...guest, gender: e.target.value as any})}><option value="">Select</option><option value="M">Male</option><option value="F">Female</option></select></label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="summary-panel" style={{ background: '#fafafa', padding: '1rem', borderRadius: '8px' }}>
              <h3 style={{ marginBottom: '1rem' }}>Booking Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                <div><strong>Primary Guest:</strong> {guestName}</div>
                <div><strong>Stay:</strong> {checkIn} - {checkOut} ({numberOfNights} Nights)</div>
                <div><strong>Room:</strong> {selectedRoom?.room_number ?? 'Unassigned'} ({roomType?.name})</div>
                <div><strong>Source:</strong> {source}</div>
                <div><strong>Guests:</strong> {adults} adults, {children.length} children{children.length ? ` (${children.join(', ')} ${childMeasure})` : ''}</div>
              </div>
              
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>Room Rate ({numberOfNights} nights x {formatCurrency(roomBasePrice)})</td>
                    <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatCurrency(roomBasePrice * numberOfNights)}</td>
                  </tr>
                  {services.map((s, i) => (
                    <tr key={i}>
                      <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>{s.service_name} ({s.quantity}x {s.pricing_model})</td>
                      <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatCurrency(calculateServiceTotal(s, numberOfNights))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: '1rem 0', fontWeight: 'bold' }}>Grand Total</td>
                    <td style={{ padding: '1rem 0', fontWeight: 'bold', textAlign: 'right', fontSize: '1.1rem' }}>{formatCurrency(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between', marginTop: '2rem' }}>
          {step > 1 ? (
            <button className="button button-quiet" type="button" onClick={() => setStep((s) => (s - 1) as any)}>Back</button>
          ) : (
            <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
          )}
          
          {step < 4 ? (
            <button className="button button-primary" type="button" onClick={() => {
              if (step === 1 && (!roomId || !guestName || numberOfNights <= 0)) {
                setFormError("Please fill required fields (Name, Dates, Room).");
                return;
              }
              setFormError(null);
              setStep((s) => (s + 1) as any);
            }}>Continue</button>
          ) : (
            <button className="button button-primary" type="button" onClick={submitBooking} disabled={createBooking.isPending}>
              {createBooking.isPending ? 'Saving…' : 'Confirm & Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
