import { ArrowUpRight, BedDouble, CalendarDays, Check, ChevronRight, ExternalLink, MoreHorizontal, Pencil, Plus, Users } from 'lucide-react';
import { Link } from 'wouter';
import { FormEvent, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import { RoomTypeActions } from '@/components/RoomTypeActions';
import { PageState } from '@/components/PageState';

const formatCurrency = (value: number | string) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(Number(value));
const emptyRoomTypeForm = { name: '', capacity: '', base_price: '' };
type RoomType = { id: string; hotel_id: string; name: string; capacity: number; base_price: number | string };

export default function HotelDetail({ id }: { id: string }) {
  const [showCreateRoomType, setShowCreateRoomType] = useState(false);
  const [showEditRoomType, setShowEditRoomType] = useState(false);
  const [showDeleteRoomType, setShowDeleteRoomType] = useState(false);
  const [propertyActionsOpen, setPropertyActionsOpen] = useState(false);
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string | null>(null);
  const [roomTypeForm, setRoomTypeForm] = useState(emptyRoomTypeForm);
  const [roomTypeError, setRoomTypeError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: hotel, isLoading, error } = trpc.channelManager.hotel.useQuery(id);
  const createRoomType = trpc.channelManager.createRoomType.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.channelManager.hotel.invalidate(id),
        utils.channelManager.hotels.invalidate(),
        utils.channelManager.dashboard.invalidate(),
      ]);
      setShowCreateRoomType(false);
      setRoomTypeForm(emptyRoomTypeForm);
      setRoomTypeError(null);
    },
    onError: mutationError => setRoomTypeError(mutationError.message),
  });
  const updateRoomType = trpc.channelManager.updateRoomType.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.channelManager.hotel.invalidate(id),
        utils.channelManager.hotels.invalidate(),
        utils.channelManager.dashboard.invalidate(),
      ]);
      setShowEditRoomType(false);
      setSelectedRoomTypeId(null);
      setRoomTypeForm(emptyRoomTypeForm);
      setRoomTypeError(null);
    },
    onError: mutationError => setRoomTypeError(mutationError.message),
  });
  const deleteRoomType = trpc.channelManager.deleteRoomType.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.channelManager.hotel.invalidate(id),
        utils.channelManager.hotels.invalidate(),
        utils.channelManager.dashboard.invalidate(),
      ]);
      setShowDeleteRoomType(false);
      setSelectedRoomTypeId(null);
      setRoomTypeError(null);
    },
    onError: mutationError => setRoomTypeError(mutationError.message),
  });

  function closeRoomTypeDialog(open: boolean) {
    if (createRoomType.isPending) return;
    setShowCreateRoomType(open);
    if (!open) setRoomTypeError(null);
  }

  function closeEditRoomTypeDialog(open: boolean) {
    if (updateRoomType.isPending) return;
    setShowEditRoomType(open);
    if (!open) {
      setSelectedRoomTypeId(null);
      setRoomTypeError(null);
    }
  }

  function openEditRoomType(type: RoomType) {
    setSelectedRoomTypeId(type.id);
    setRoomTypeForm({ name: type.name, capacity: String(type.capacity), base_price: String(type.base_price) });
    setRoomTypeError(null);
    setShowEditRoomType(true);
  }

  function openDeleteRoomType(type: RoomType) {
    setSelectedRoomTypeId(type.id);
    setRoomTypeError(null);
    setShowDeleteRoomType(true);
  }

  function validateRoomTypeForm() {
    const name = roomTypeForm.name.trim();
    const capacity = Number(roomTypeForm.capacity);
    const basePrice = Number(roomTypeForm.base_price);
    if (!name) {
      setRoomTypeError('Enter a room type name.');
      return null;
    }
    if (!Number.isInteger(capacity) || capacity <= 0) {
      setRoomTypeError('Capacity must be a positive whole number.');
      return null;
    }
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      setRoomTypeError('Base price must be greater than zero.');
      return null;
    }
    return { name, capacity, base_price: basePrice };
  }

  function submitCreateRoomType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoomTypeError(null);
    const values = validateRoomTypeForm();
    if (!values) return;
    createRoomType.mutate({ hotel_id: id, ...values });
  }

  function submitEditRoomType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoomTypeError(null);
    if (!selectedRoomTypeId) {
      setRoomTypeError('Select a room type to edit.');
      return;
    }
    const values = validateRoomTypeForm();
    if (!values) return;
    updateRoomType.mutate({ hotel_id: id, room_type_id: selectedRoomTypeId, ...values });
  }

  function confirmDeleteRoomType() {
    if (!selectedRoomTypeId || deleteRoomType.isPending) return;
    setRoomTypeError(null);
    deleteRoomType.mutate({ hotel_id: id, room_type_id: selectedRoomTypeId });
  }
  if (isLoading) return <div className="page-content"><PageState tone="loading" title="กำลังโหลดข้อมูลโรงแรม" description="กำลังตรวจสอบข้อมูลตามสิทธิ์ของสมาชิกโรงแรม" /></div>;
  if (error || !hotel) return <div className="page-content"><PageState tone="error" title="โหลดข้อมูลโรงแรมไม่สำเร็จ" description={error?.message ?? "ไม่พบโรงแรมนี้หรือคุณไม่มีสิทธิ์เข้าถึง"} actionLabel="ลองใหม่" onAction={() => void utils.channelManager.hotel.invalidate(id)} /></div>;
  const availableRooms = hotel.rooms.filter(room => room.status === 'available').length;
  const lowestRate = hotel.room_types.length ? Math.min(...hotel.room_types.map(type => Number(type.base_price))) : 0;

  return <div className="page-content hotel-detail-page"><div className="detail-back"><Link href="/hotels">Hotels</Link><ChevronRight size={14} /><span>{hotel.name}</span></div><section className="property-hero"><div className="property-hero-image property-hero-monogram"><span aria-hidden="true">{hotel.name.slice(0, 1)}</span><span className={`status-pill ${hotel.public_enabled ? 'live' : 'setup'}`}><i />{hotel.public_enabled ? 'Live' : 'Private'}</span></div><div className="property-hero-copy"><div className="eyebrow">Property / {hotel.id.slice(0, 8)}</div><h1>{hotel.name}<span className="title-mark">.</span></h1><p>{hotel.address}</p><div className="property-meta"><span><Users size={15} /> Access controlled by hotel membership</span><span><ExternalLink size={15} /> /{hotel.slug}</span></div></div><div className="property-actions"><button className="button button-quiet" disabled title="Property editing will be enabled with the management workflow"><Pencil size={15} /> Edit property</button><div className="dropdown-anchor property-action-menu"><button className="icon-button bordered" type="button" aria-label="More property actions" aria-haspopup="menu" aria-expanded={propertyActionsOpen} onClick={() => setPropertyActionsOpen(open => !open)}><MoreHorizontal size={17} /></button>{propertyActionsOpen && <div className="menu-surface menu-surface--property-actions" role="menu" aria-label="Property actions"><button className="menu-surface-item" type="button" disabled title="Property editing will be enabled with the management workflow"><Pencil size={14} /> Edit property <span className="menu-surface-note">Coming soon</span></button></div>}</div></div></section><nav className="detail-tabs"><Link href={`/hotels/${hotel.id}`} className="active">Room types</Link><Link href={`/hotels/${hotel.id}/bookings`}>Bookings</Link><Link href={`/hotels/${hotel.id}/calendar`}>Availability</Link><a href="#" onClick={event => event.preventDefault()}>Images</a><a href="#" onClick={event => event.preventDefault()}>Domains</a></nav><section className="detail-kpis"><div><span>Rooms</span><strong>{hotel.rooms.length}</strong><small>across {hotel.room_types.length} types</small></div><div><span>Available today</span><strong>{availableRooms}</strong><small className="green-text">Current room status</small></div><div><span>Base rate</span><strong>{lowestRate ? formatCurrency(lowestRate) : '—'}</strong><small>lowest configured rate</small></div><div><span>Public site</span><strong>{hotel.public_enabled ? 'Live' : 'Private'}</strong><small>governed by public flag</small></div></section><section className="panel room-types-panel"><div className="panel-heading"><div><div className="eyebrow">Inventory / Room types</div><h2>Room types</h2></div><button className="button button-primary" type="button" onClick={() => { setRoomTypeError(null); setShowCreateRoomType(true); }}><Plus size={16} /> Add room type</button></div><div className="room-type-list">{hotel.room_types.length ? hotel.room_types.map(type => { const rooms = hotel.rooms.filter(room => room.room_type_id === type.id); const occupied = rooms.filter(room => room.status !== 'available').length; const occupancy = rooms.length ? Math.round(occupied / rooms.length * 100) : 0; return <div className="room-type-row" key={type.id}><div className="room-type-icon pine"><BedDouble size={19} /></div><div className="room-type-name"><strong>{type.name}</strong><span>{rooms.length} rooms · Base rate {formatCurrency(type.base_price)}</span></div><div className="room-type-occupancy"><span>Occupied</span><strong>{occupancy}%</strong><div className="mini-progress"><span style={{ width: `${occupancy}%` }} /></div></div><div className="room-type-price"><span>Base rate</span><strong>{formatCurrency(type.base_price)}</strong></div><RoomTypeActions roomType={type} onEdit={openEditRoomType} onDelete={openDeleteRoomType} /></div>; }) : <div className="empty-state"><BedDouble size={20} /><strong>No room types configured</strong><span>Create room types in the management workflow to track availability.</span></div>}</div></section><section className="detail-bottom-grid"><div className="panel quick-panel"><div className="eyebrow">Quick links</div><h3>Common tasks</h3><Link href={`/hotels/${hotel.id}/calendar`}><span className="quick-icon"><CalendarDays size={16} /></span><span><strong>Update availability</strong><small>Set daily room count and rate</small></span><ArrowUpRight size={15} /></Link><Link href={`/hotels/${hotel.id}/bookings`}><span className="quick-icon"><Users size={16} /></span><span><strong>Review bookings</strong><small>Open arrivals and departures</small></span><ArrowUpRight size={15} /></Link></div><div className="panel checklist-panel"><div className="eyebrow">Property setup</div><h3>{hotel.public_enabled ? 'Publicly available' : 'Private workspace'}</h3><div className="checklist-row"><span className="check-circle"><Check size={13} /></span><span>Hotel membership controls access</span><small>RLS</small></div><div className="checklist-row"><span className="check-circle"><Check size={13} /></span><span>Room inventory is persisted in Supabase</span><small>Live</small></div><div className="checklist-row"><span className="check-circle"><Check size={13} /></span><span>Public page requires public enablement</span><small>{hotel.public_enabled ? 'Live' : 'Private'}</small></div></div></section>
    <Dialog open={showCreateRoomType} onOpenChange={closeRoomTypeDialog}>
      <DialogContent className="modal-card">
        <DialogHeader className="modal-head"><div><div className="eyebrow">Inventory / New room type</div><DialogTitle>Add a room type</DialogTitle><DialogDescription className="modal-lede">Configure a sellable room category for {hotel.name}. The hotel is fixed to the current property.</DialogDescription></div></DialogHeader>
        <form onSubmit={submitCreateRoomType}>
          {roomTypeError && <p className="form-error" role="alert">{roomTypeError}</p>}
          <div className="form-grid">
            <label className="form-span-two">Room type name<input autoFocus required value={roomTypeForm.name} onChange={event => setRoomTypeForm({ ...roomTypeForm, name: event.target.value })} placeholder="Enter room type name" /></label>
            <label>Capacity<input required min="1" step="1" type="number" value={roomTypeForm.capacity} onChange={event => setRoomTypeForm({ ...roomTypeForm, capacity: event.target.value })} placeholder="Number of guests" /></label>
            <label>Base price (THB)<input required min="0.01" step="0.01" type="number" value={roomTypeForm.base_price} onChange={event => setRoomTypeForm({ ...roomTypeForm, base_price: event.target.value })} placeholder="Amount in THB" /></label>
          </div>
          <DialogFooter className="modal-actions"><button className="button button-quiet" type="button" onClick={() => closeRoomTypeDialog(false)} disabled={createRoomType.isPending}>Cancel</button><button className="button button-primary" type="submit" disabled={createRoomType.isPending}>{createRoomType.isPending ? 'Creating…' : 'Create room type'}</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={showEditRoomType} onOpenChange={closeEditRoomTypeDialog}>
      <DialogContent className="modal-card">
        <DialogHeader className="modal-head"><div><div className="eyebrow">Inventory / Edit room type</div><DialogTitle>Update room type</DialogTitle><DialogDescription className="modal-lede">Change the sellable room category details. Updates are scoped to {hotel.name} by Supabase RLS.</DialogDescription></div></DialogHeader>
        <form onSubmit={submitEditRoomType}>
          {roomTypeError && <p className="form-error" role="alert">{roomTypeError}</p>}
          <div className="form-grid">
            <label className="form-span-two">Room type name<input autoFocus required value={roomTypeForm.name} onChange={event => setRoomTypeForm({ ...roomTypeForm, name: event.target.value })} placeholder="Enter room type name" /></label>
            <label>Capacity<input required min="1" step="1" type="number" value={roomTypeForm.capacity} onChange={event => setRoomTypeForm({ ...roomTypeForm, capacity: event.target.value })} placeholder="Number of guests" /></label>
            <label>Base price (THB)<input required min="0.01" step="0.01" type="number" value={roomTypeForm.base_price} onChange={event => setRoomTypeForm({ ...roomTypeForm, base_price: event.target.value })} placeholder="Amount in THB" /></label>
          </div>
          <DialogFooter className="modal-actions"><button className="button button-quiet" type="button" onClick={() => closeEditRoomTypeDialog(false)} disabled={updateRoomType.isPending}>Cancel</button><button className="button button-primary" type="submit" disabled={updateRoomType.isPending}>{updateRoomType.isPending ? 'Saving…' : 'Save changes'}</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={showDeleteRoomType} onOpenChange={open => { if (deleteRoomType.isPending) return; setShowDeleteRoomType(open); if (!open) { setSelectedRoomTypeId(null); setRoomTypeError(null); } }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Delete room type?</AlertDialogTitle><AlertDialogDescription>{roomTypeError ?? 'This removes the room type from the hotel inventory. Any dependent room and availability records follow the database cascade rules.'}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={deleteRoomType.isPending}>Cancel</AlertDialogCancel><AlertDialogAction onClick={event => { event.preventDefault(); confirmDeleteRoomType(); }} disabled={deleteRoomType.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{deleteRoomType.isPending ? 'Deleting…' : 'Delete room type'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
