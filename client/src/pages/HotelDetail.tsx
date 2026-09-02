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
import { useTranslation } from '@/lib/i18n';

const formatCurrency = (value: number | string) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(Number(value));
const emptyRoomTypeForm = { name: '', capacity: '', base_price: '', quantity: '' };
type RoomType = { id: string; hotel_id: string; name: string; capacity: number; base_price: number | string };

export default function HotelDetail({ id }: { id: string }) {
  const { t } = useTranslation();
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
    setRoomTypeForm({ name: type.name, capacity: String(type.capacity), base_price: String(type.base_price), quantity: '' });
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
    const quantity = Number(roomTypeForm.quantity);
    if (!name) {
      setRoomTypeError(t('hotelDetail.errorNameRequired'));
      return null;
    }
    if (!Number.isInteger(capacity) || capacity <= 0) {
      setRoomTypeError(t('hotelDetail.errorCapacityInvalid'));
      return null;
    }
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      setRoomTypeError(t('hotelDetail.errorBasePriceInvalid'));
      return null;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setRoomTypeError(t('hotelDetail.errorQuantityInvalid'));
      return null;
    }
    return { name, capacity, base_price: basePrice, quantity };
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
      setRoomTypeError(t('hotelDetail.errorSelectToEdit'));
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
  if (isLoading) return <div className="page-content"><PageState tone="loading" title={t('hotelDetail.loadingTitle')} description={t('hotelDetail.loadingDesc')} /></div>;
  if (error || !hotel) return <div className="page-content"><PageState tone="error" title={t('hotelDetail.errorTitle')} description={error?.message ?? t('hotelDetail.errorDescFallback')} actionLabel={t('hotelDetail.retryButton')} onAction={() => void utils.channelManager.hotel.invalidate(id)} /></div>;
  const availableRooms = hotel.rooms.filter(room => room.status === 'available').length;
  const lowestRate = hotel.room_types.length ? Math.min(...hotel.room_types.map(type => Number(type.base_price))) : 0;

  return <div className="page-content hotel-detail-page"><div className="detail-back"><Link href="/hotels">{t('hotelDetail.backToHotels')}</Link><ChevronRight size={14} /><span>{hotel.name}</span></div><section className="property-hero"><div className="property-hero-image property-hero-monogram"><span aria-hidden="true">{hotel.name.slice(0, 1)}</span><span className={`status-pill ${hotel.public_enabled ? 'live' : 'setup'}`}><i />{hotel.public_enabled ? t('hotelDetail.livePill') : t('hotelDetail.privatePill')}</span></div><div className="property-hero-copy"><div className="eyebrow">{t('hotelDetail.propertyId', { id: hotel.id.slice(0, 8) })}</div><h1>{hotel.name}<span className="title-mark">.</span></h1><p>{hotel.address}</p><div className="property-meta"><span><Users size={15} /> {t('hotelDetail.accessControlled')}</span><span><ExternalLink size={15} /> /{hotel.slug}</span></div></div><div className="property-actions"><button className="button button-quiet" disabled title={t('hotelDetail.editPropertyTooltip')}><Pencil size={15} /> {t('hotelDetail.editProperty')}</button><div className="dropdown-anchor property-action-menu"><button className="icon-button bordered" type="button" aria-label={t('hotelDetail.morePropertyActionsAria')} aria-haspopup="menu" aria-expanded={propertyActionsOpen} onClick={() => setPropertyActionsOpen(open => !open)}><MoreHorizontal size={17} /></button>{propertyActionsOpen && <div className="menu-surface menu-surface--property-actions" role="menu" aria-label={t('hotelDetail.propertyActionsRoleAria')}><button className="menu-surface-item" type="button" disabled title={t('hotelDetail.editPropertyTooltip')}><Pencil size={14} /> {t('hotelDetail.editProperty')} <span className="menu-surface-note">{t('hotelDetail.comingSoon')}</span></button></div>}</div></div></section><nav className="detail-tabs"><Link href={`/hotels/${hotel.id}`} className="active">{t('hotelDetail.tabRoomTypes')}</Link><Link href={`/hotels/${hotel.id}/bookings`}>{t('hotelDetail.tabBookings')}</Link><Link href={`/hotels/${hotel.id}/calendar`}>{t('hotelDetail.tabAvailability')}</Link><Link href={`/hotels/${hotel.id}/services`}>{t('hotelDetail.tabServices')}</Link><a href="#" onClick={event => event.preventDefault()}>{t('hotelDetail.tabImages')}</a><a href="#" onClick={event => event.preventDefault()}>{t('hotelDetail.tabDomains')}</a></nav><section className="detail-kpis"><div><span>{t('hotelDetail.kpiRooms')}</span><strong>{hotel.rooms.length}</strong><small>{t('hotelDetail.kpiRoomsSub', { count: hotel.room_types.length })}</small></div><div><span>{t('hotelDetail.kpiAvailable')}</span><strong>{availableRooms}</strong><small className="green-text">{t('hotelDetail.kpiAvailableSub')}</small></div><div><span>{t('hotelDetail.kpiBaseRate')}</span><strong>{lowestRate ? formatCurrency(lowestRate) : '—'}</strong><small>{t('hotelDetail.kpiBaseRateSub')}</small></div><div><span>{t('hotelDetail.kpiPublicSite')}</span><strong>{hotel.public_enabled ? t('hotelDetail.livePill') : t('hotelDetail.privatePill')}</strong><small>{t('hotelDetail.kpiPublicSiteSub')}</small></div></section><section className="panel room-types-panel"><div className="panel-heading"><div><div className="eyebrow">{t('hotelDetail.eyebrowRoomTypes')}</div><h2>{t('hotelDetail.headingRoomTypes')}</h2></div><button className="button button-primary" type="button" onClick={() => { setRoomTypeError(null); setShowCreateRoomType(true); }}><Plus size={16} /> {t('hotelDetail.addRoomType')}</button></div><div className="room-type-list">{hotel.room_types.length ? hotel.room_types.map(type => { const rooms = hotel.rooms.filter(room => room.room_type_id === type.id); const occupied = rooms.filter(room => room.status !== 'available').length; const occupancy = rooms.length ? Math.round(occupied / rooms.length * 100) : 0; return <div className="room-type-row" key={type.id}><div className="room-type-icon pine"><BedDouble size={19} /></div><div className="room-type-name"><strong>{type.name}</strong><span>{t('hotelDetail.roomsAndRate', { count: rooms.length, rate: formatCurrency(type.base_price) })}</span></div><div className="room-type-occupancy"><span>{t('hotelDetail.occupied')}</span><strong>{occupancy}%</strong><div className="mini-progress"><span style={{ width: `${occupancy}%` }} /></div></div><div className="room-type-price"><span>{t('hotelDetail.baseRateLabel')}</span><strong>{formatCurrency(type.base_price)}</strong></div><RoomTypeActions roomType={type} onEdit={openEditRoomType} onDelete={openDeleteRoomType} /></div>; }) : <div className="empty-state"><BedDouble size={20} /><strong>{t('hotelDetail.noRoomTypesTitle')}</strong><span>{t('hotelDetail.noRoomTypesDesc')}</span></div>}</div></section><section className="detail-bottom-grid"><div className="panel quick-panel"><div className="eyebrow">{t('hotelDetail.quickLinks')}</div><h3>{t('hotelDetail.commonTasks')}</h3><Link href={`/hotels/${hotel.id}/calendar`}><span className="quick-icon"><CalendarDays size={16} /></span><span><strong>{t('hotelDetail.updateAvailabilityTitle')}</strong><small>{t('hotelDetail.updateAvailabilityDesc')}</small></span><ArrowUpRight size={15} /></Link><Link href={`/hotels/${hotel.id}/bookings`}><span className="quick-icon"><Users size={16} /></span><span><strong>{t('hotelDetail.reviewBookingsTitle')}</strong><small>{t('hotelDetail.reviewBookingsDesc')}</small></span><ArrowUpRight size={15} /></Link></div><div className="panel checklist-panel"><div className="eyebrow">{t('hotelDetail.propertySetup')}</div><h3>{hotel.public_enabled ? t('hotelDetail.publiclyAvailable') : t('hotelDetail.privateWorkspace')}</h3><div className="checklist-row"><span className="check-circle"><Check size={13} /></span><span>{t('hotelDetail.checkMembership')}</span><small>{t('hotelDetail.checkMembershipBadge')}</small></div><div className="checklist-row"><span className="check-circle"><Check size={13} /></span><span>{t('hotelDetail.checkInventory')}</span><small>{t('hotelDetail.checkInventoryBadge')}</small></div><div className="checklist-row"><span className="check-circle"><Check size={13} /></span><span>{t('hotelDetail.checkPublic')}</span><small>{hotel.public_enabled ? t('hotelDetail.livePill') : t('hotelDetail.privatePill')}</small></div></div></section>
    <Dialog open={showCreateRoomType} onOpenChange={closeRoomTypeDialog}>
      <DialogContent className="modal-card">
        <DialogHeader className="modal-head"><div><div className="eyebrow">{t('hotelDetail.newRoomTypeEyebrow')}</div><DialogTitle>{t('hotelDetail.newRoomTypeTitle')}</DialogTitle><DialogDescription className="modal-lede">{t('hotelDetail.newRoomTypeDesc', { name: hotel.name })}</DialogDescription></div></DialogHeader>
        <form onSubmit={submitCreateRoomType}>
          {roomTypeError && <p className="form-error" role="alert">{roomTypeError}</p>}
          <div className="form-grid">
            <label className="form-span-two">{t('hotelDetail.roomTypeNameLabel')}<input autoFocus required value={roomTypeForm.name} onChange={event => setRoomTypeForm({ ...roomTypeForm, name: event.target.value })} placeholder={t('hotelDetail.roomTypeNamePlaceholder')} /></label>
            <label>{t('hotelDetail.capacityLabel')}<input required min="1" step="1" type="number" value={roomTypeForm.capacity} onChange={event => setRoomTypeForm({ ...roomTypeForm, capacity: event.target.value })} placeholder={t('hotelDetail.capacityPlaceholder')} /></label>
            <label>{t('hotelDetail.basePriceLabel')}<input required min="0.01" step="0.01" type="number" value={roomTypeForm.base_price} onChange={event => setRoomTypeForm({ ...roomTypeForm, base_price: event.target.value })} placeholder={t('hotelDetail.basePricePlaceholder')} /></label>
            <label>{t('hotelDetail.quantityLabel')}<input required min="1" step="1" type="number" value={roomTypeForm.quantity} onChange={event => setRoomTypeForm({ ...roomTypeForm, quantity: event.target.value })} placeholder={t('hotelDetail.quantityPlaceholder')} /></label>
          </div>
          <DialogFooter className="modal-actions"><button className="button button-quiet" type="button" onClick={() => closeRoomTypeDialog(false)} disabled={createRoomType.isPending}>{t('hotelDetail.cancel')}</button><button className="button button-primary" type="submit" disabled={createRoomType.isPending}>{createRoomType.isPending ? t('hotelDetail.creating') : t('hotelDetail.createRoomType')}</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={showEditRoomType} onOpenChange={closeEditRoomTypeDialog}>
      <DialogContent className="modal-card">
        <DialogHeader className="modal-head"><div><div className="eyebrow">{t('hotelDetail.editRoomTypeEyebrow')}</div><DialogTitle>{t('hotelDetail.editRoomTypeTitle')}</DialogTitle><DialogDescription className="modal-lede">{t('hotelDetail.editRoomTypeDesc', { name: hotel.name })}</DialogDescription></div></DialogHeader>
        <form onSubmit={submitEditRoomType}>
          {roomTypeError && <p className="form-error" role="alert">{roomTypeError}</p>}
          <div className="form-grid">
            <label className="form-span-two">{t('hotelDetail.roomTypeNameLabel')}<input autoFocus required value={roomTypeForm.name} onChange={event => setRoomTypeForm({ ...roomTypeForm, name: event.target.value })} placeholder={t('hotelDetail.roomTypeNamePlaceholder')} /></label>
            <label>{t('hotelDetail.capacityLabel')}<input required min="1" step="1" type="number" value={roomTypeForm.capacity} onChange={event => setRoomTypeForm({ ...roomTypeForm, capacity: event.target.value })} placeholder={t('hotelDetail.capacityPlaceholder')} /></label>
            <label>{t('hotelDetail.basePriceLabel')}<input required min="0.01" step="0.01" type="number" value={roomTypeForm.base_price} onChange={event => setRoomTypeForm({ ...roomTypeForm, base_price: event.target.value })} placeholder={t('hotelDetail.basePricePlaceholder')} /></label>
          </div>
          <DialogFooter className="modal-actions"><button className="button button-quiet" type="button" onClick={() => closeEditRoomTypeDialog(false)} disabled={updateRoomType.isPending}>{t('hotelDetail.cancel')}</button><button className="button button-primary" type="submit" disabled={updateRoomType.isPending}>{updateRoomType.isPending ? t('hotelDetail.saving') : t('hotelDetail.saveChanges')}</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={showDeleteRoomType} onOpenChange={open => { if (deleteRoomType.isPending) return; setShowDeleteRoomType(open); if (!open) { setSelectedRoomTypeId(null); setRoomTypeError(null); } }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t('hotelDetail.deleteConfirmTitle')}</AlertDialogTitle><AlertDialogDescription>{roomTypeError ?? t('hotelDetail.deleteConfirmDesc')}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={deleteRoomType.isPending}>{t('hotelDetail.cancel')}</AlertDialogCancel><AlertDialogAction onClick={event => { event.preventDefault(); confirmDeleteRoomType(); }} disabled={deleteRoomType.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{deleteRoomType.isPending ? t('hotelDetail.deleting') : t('hotelDetail.deleteRoomType')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
