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
import { hasHotelPermission } from '@shared/authorization';
import { defaultChildRateConfig, defaultOccupancyPricing, getRoomTypePricingValidationError, type ChildRateConfig, type OccupancyPriceLevel } from '@shared/occupancyPricing';

const formatCurrency = (value: number | string) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(Number(value));
const emptyRoomTypeForm = { name: '', capacity: '2', base_price: '', quantity: '', base_occupancy: '2', occupancy_pricing: defaultOccupancyPricing(2, 2), child_rule: 'age' as 'age' | 'height', child_rule_limit: '', child_rates: defaultChildRateConfig(), children_count_toward_max: true };
type RoomType = { id: string; hotel_id: string; name: string; capacity: number; base_price: number | string; base_occupancy: number; max_occupancy: number; occupancy_pricing: Record<string, OccupancyPriceLevel>; child_rule: 'age' | 'height'; child_rule_limit: number | string | null; child_rates: ChildRateConfig; children_count_toward_max: boolean };

function completeOccupancyPricing(pricing: Record<string, OccupancyPriceLevel>, base: number, max: number) {
  return Object.fromEntries(Array.from({ length: Math.max(0, max) }, (_, index) => {
    const count = index + 1;
    const level = count === base ? { enabled: true, mode: 'percent' as const, value: 0 } : pricing[String(count)] ?? { enabled: false, mode: 'percent' as const, value: 0 };
    return [String(count), level];
  }));
}

function normalizeAgeGroupRanges(groups: ChildRateConfig['age_groups']) {
  return groups.map((group, index) => ({
    ...group,
    min_age: index === 0 ? 3 : Number(groups[index - 1].max_age) + 1,
  }));
}

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
  const authMeQuery = trpc.auth.me.useQuery();
  const canPublish = hasHotelPermission(authMeQuery.data?.roles ?? [], authMeQuery.data?.memberships ?? [], id, 'property.manage_profile');
  const [publishError, setPublishError] = useState<string | null>(null);
  const setPublished = trpc.channelManager.setHotelPublished.useMutation({
    onSuccess: async () => {
      setPublishError(null);
      await Promise.all([
        utils.channelManager.hotel.invalidate(id),
        utils.channelManager.hotels.invalidate(),
        utils.channelManager.dashboard.invalidate(),
      ]);
    },
    onError: mutationError => setPublishError(mutationError.message),
  });
  function togglePublished(next: boolean) {
    if (!next && !window.confirm(t('hotelDetail.confirmUnpublish'))) return;
    setPublishError(null);
    setPublished.mutate({ hotel_id: id, public_enabled: next });
  }
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
    setRoomTypeForm({
      name: type.name,
      capacity: String(type.max_occupancy),
      base_price: String(type.base_price),
      quantity: '',
      base_occupancy: String(type.base_occupancy),
      occupancy_pricing: completeOccupancyPricing(type.occupancy_pricing, type.base_occupancy, type.max_occupancy),
      child_rule: type.child_rule,
      child_rule_limit: type.child_rule_limit == null ? '' : String(type.child_rule_limit),
      child_rates: type.child_rates,
      children_count_toward_max: type.children_count_toward_max,
    });
    setRoomTypeError(null);
    setShowEditRoomType(true);
  }

  function openDeleteRoomType(type: RoomType) {
    setSelectedRoomTypeId(type.id);
    setRoomTypeError(null);
    setShowDeleteRoomType(true);
  }

  function validateRoomTypeForm(requireQuantity: boolean) {
    const name = roomTypeForm.name.trim();
    const capacity = Number(roomTypeForm.capacity);
    const basePrice = Number(roomTypeForm.base_price);
    const quantity = Number(roomTypeForm.quantity);
    const baseOccupancy = Number(roomTypeForm.base_occupancy);
    const maxOccupancy = Number(roomTypeForm.capacity);
    const childRuleLimit = roomTypeForm.child_rule_limit.trim() === '' ? null : Number(roomTypeForm.child_rule_limit);
    const occupancyPricing = Object.fromEntries(Object.entries(completeOccupancyPricing(roomTypeForm.occupancy_pricing, baseOccupancy, maxOccupancy)).map(([count, level]) => [count, { ...level, value: Number(level.value) }]));
    const childRates = {
      infant: { ...roomTypeForm.child_rates.infant, value: Number(roomTypeForm.child_rates.infant.value) },
      age_groups: roomTypeForm.child_rates.age_groups.map(group => ({ ...group, min_age: Number(group.min_age), max_age: Number(group.max_age), value: Number(group.value) })),
      height: { ...roomTypeForm.child_rates.height, value: Number(roomTypeForm.child_rates.height.value) },
    };
    if (!name) {
      setRoomTypeError(t('hotelDetail.errorNameRequired'));
      return null;
    }
    if (!Number.isInteger(capacity) || capacity <= 0) {
      setRoomTypeError(t('hotelDetail.errorCapacityInvalid'));
      return null;
    }
    if (!Number.isInteger(baseOccupancy) || baseOccupancy <= 0 || maxOccupancy < baseOccupancy) {
      setRoomTypeError(t('hotelDetail.errorOccupancyInvalid'));
      return null;
    }
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      setRoomTypeError(t('hotelDetail.errorBasePriceInvalid'));
      return null;
    }
    if (requireQuantity && (!Number.isInteger(quantity) || quantity <= 0)) {
      setRoomTypeError(t('hotelDetail.errorQuantityInvalid'));
      return null;
    }
    if (childRuleLimit != null && (!Number.isFinite(childRuleLimit) || childRuleLimit < 0)) {
      setRoomTypeError(t('hotelDetail.errorPricingInvalid'));
      return null;
    }
    const pricingError = getRoomTypePricingValidationError({
      base_occupancy: baseOccupancy,
      max_occupancy: maxOccupancy,
      occupancy_pricing: occupancyPricing,
      child_rule: roomTypeForm.child_rule,
      child_rule_limit: childRuleLimit,
      child_rates: childRates,
    });
    if (pricingError) {
      setRoomTypeError(t('hotelDetail.errorPricingInvalid'));
      return null;
    }
    return { name, capacity: maxOccupancy, max_occupancy: maxOccupancy, base_occupancy: baseOccupancy, base_price: basePrice, quantity, occupancy_pricing: occupancyPricing, child_rule: roomTypeForm.child_rule, child_rule_limit: childRuleLimit, child_rates: childRates, children_count_toward_max: roomTypeForm.children_count_toward_max };
  }

  function submitCreateRoomType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoomTypeError(null);
    const values = validateRoomTypeForm(true);
    if (!values) return;
    createRoomType.mutate({ hotel_id: id, ...values, child_rule: hotel?.room_types[0]?.child_rule ?? values.child_rule });
  }

  function submitEditRoomType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoomTypeError(null);
    if (!selectedRoomTypeId) {
      setRoomTypeError(t('hotelDetail.errorSelectToEdit'));
      return;
    }
    const values = validateRoomTypeForm(false);
    if (!values) return;
    updateRoomType.mutate({ hotel_id: id, room_type_id: selectedRoomTypeId, ...values });
  }

  function confirmDeleteRoomType() {
    if (!selectedRoomTypeId || deleteRoomType.isPending) return;
    setRoomTypeError(null);
    deleteRoomType.mutate({ hotel_id: id, room_type_id: selectedRoomTypeId });
  }
  function occupancyPricingFields() {
    const base = Number(roomTypeForm.base_occupancy);
    const max = Number(roomTypeForm.capacity);
    const levels = Array.from({ length: Number.isInteger(max) ? Math.max(0, Math.min(max, 20)) : 0 }, (_, index) => index + 1);
    const updateChildRate = (key: 'infant' | 'height', field: 'mode' | 'value', value: string) => setRoomTypeForm({
      ...roomTypeForm,
      child_rates: { ...roomTypeForm.child_rates, [key]: {
        ...roomTypeForm.child_rates[key],
        mode: field === 'mode' ? value as 'free' | 'fixed' | 'percent' : roomTypeForm.child_rates[key].mode,
        value: field === 'value' ? value : roomTypeForm.child_rates[key].value,
      } },
    });
    const childRateEditor = (label: string, rate: { mode: 'free' | 'fixed' | 'percent'; value: number | string }, onChange: (field: 'mode' | 'value', value: string) => void) => <div className="child-rate-editor" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: 8 }}>
      <strong>{label}</strong>
      <select aria-label={`${label} rate mode`} value={rate.mode} onChange={event => onChange('mode', event.target.value)}>
        <option value="free">{t('hotelDetail.childPriceFree')}</option><option value="fixed">{t('hotelDetail.childPriceFixed')}</option><option value="percent">{t('hotelDetail.childPricePercent')}</option>
      </select>
      {rate.mode !== 'free' && <input aria-label={`${label} rate value`} type="number" min="0" step="0.01" value={rate.value} onChange={event => onChange('value', event.target.value)} />}
    </div>;
    return <fieldset className="form-span-two" style={{ border: '1px solid #dce4df', borderRadius: 10, padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <legend>{t('hotelDetail.occupancyPricingTitle')}</legend>
      <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 12, color: '#64736b' }}>{t('hotelDetail.childRuleSharedHint')}</p>
      <label>{t('hotelDetail.baseOccupancyLabel')}<input type="number" min="1" max="20" step="1" required value={roomTypeForm.base_occupancy} onChange={event => {
        const nextBase = Number(event.target.value);
        setRoomTypeForm({ ...roomTypeForm, base_occupancy: event.target.value, occupancy_pricing: completeOccupancyPricing(roomTypeForm.occupancy_pricing, nextBase, max) });
      }} /></label>
      <label>{t('hotelDetail.maxOccupancyLabel')}<input type="number" min="1" max="20" step="1" required value={roomTypeForm.capacity} onChange={event => {
        const nextMax = Number(event.target.value);
        setRoomTypeForm({ ...roomTypeForm, capacity: event.target.value, occupancy_pricing: completeOccupancyPricing(roomTypeForm.occupancy_pricing, base, nextMax) });
      }} /></label>
      <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 12, color: '#64736b' }}>{t('hotelDetail.occupancyPricingHint')}</p>
      {levels.map(count => {
        const current = roomTypeForm.occupancy_pricing[String(count)] ?? { enabled: true, mode: 'percent' as const, value: 0 };
        const isBase = count === base;
        return <div className="occupancy-level-editor" key={count} style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #e7ece9' }}>
          <label className="occupancy-level-toggle"><input type="checkbox" checked={current.enabled} disabled={isBase} onChange={event => setRoomTypeForm({ ...roomTypeForm, occupancy_pricing: { ...roomTypeForm.occupancy_pricing, [String(count)]: { ...current, enabled: event.target.checked } } })} />{t('hotelDetail.occupancyLevelLabel', { count })}</label>
          {isBase ? <span>{t('hotelDetail.occupancyBaseRate')}</span> : <>
            <select disabled={!current.enabled} aria-label={t('hotelDetail.occupancyModeAria', { count })} value={current.mode} onChange={event => setRoomTypeForm({ ...roomTypeForm, occupancy_pricing: { ...roomTypeForm.occupancy_pricing, [String(count)]: { ...current, mode: event.target.value as 'percent' | 'fixed' } } })}>
              <option value="percent">{t('hotelDetail.occupancyPercent')}</option><option value="fixed">{t('hotelDetail.occupancyFixed')}</option>
            </select>
            <input disabled={!current.enabled} aria-label={t('hotelDetail.occupancyValueAria', { count })} type="number" step="0.01" value={current.value} onChange={event => setRoomTypeForm({ ...roomTypeForm, occupancy_pricing: { ...roomTypeForm.occupancy_pricing, [String(count)]: { ...current, value: event.target.value } } })} />
          </>}
        </div>;
      })}
      <label>{t('hotelDetail.childRuleLabel')}<select disabled={showCreateRoomType && Boolean(hotel?.room_types.length)} value={roomTypeForm.child_rule} onChange={event => setRoomTypeForm({ ...roomTypeForm, child_rule: event.target.value as 'age' | 'height', child_rule_limit: '' })}><option value="age">{t('hotelDetail.childRuleAge')}</option><option value="height">{t('hotelDetail.childRuleHeight')}</option></select></label>
      {roomTypeForm.child_rule === 'height' && <label>{t('hotelDetail.childHeightLimitLabel')}<input type="number" min="0" step="0.5" required value={roomTypeForm.child_rule_limit} onChange={event => setRoomTypeForm({ ...roomTypeForm, child_rule_limit: event.target.value })} /></label>}
      {roomTypeForm.child_rule === 'age' ? <>
        <div className="child-age-rates form-span-two" style={{ display: 'grid', gap: 10 }}>
          <strong>{t('hotelDetail.infantAgeBand')}</strong>
          <small>{t('hotelDetail.infantAgeFixedRange')}</small>
          {childRateEditor(t('hotelDetail.infantRateLabel'), roomTypeForm.child_rates.infant, (field, value) => updateChildRate('infant', field, value))}
          {roomTypeForm.child_rates.age_groups.map((group, index) => {
            const minAge = index === 0 ? 3 : Number(roomTypeForm.child_rates.age_groups[index - 1].max_age) + 1;
            return <div className="child-age-group-editor" key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', alignItems: 'end', gap: 8 }}>
              <label>{t('hotelDetail.childAgeGroupLabel', { count: index + 1 })}<span>{minAge}–</span><input type="number" min={minAge} max="17" value={group.max_age} onChange={event => setRoomTypeForm({ ...roomTypeForm, child_rates: { ...roomTypeForm.child_rates, age_groups: normalizeAgeGroupRanges(roomTypeForm.child_rates.age_groups.map((item, itemIndex) => itemIndex === index ? { ...item, max_age: Number(event.target.value) } : item)) } })} /><small>{t('hotelDetail.childAgeGroupMinHint', { age: minAge })}</small></label>
              {childRateEditor(t('hotelDetail.childAgeGroupRate'), group, (field, value) => setRoomTypeForm({ ...roomTypeForm, child_rates: { ...roomTypeForm.child_rates, age_groups: roomTypeForm.child_rates.age_groups.map((item, itemIndex) => itemIndex === index ? {
                ...item,
                mode: field === 'mode' ? value as 'free' | 'fixed' | 'percent' : item.mode,
                value: field === 'value' ? value : item.value,
              } : item) } }))}
              <button type="button" className="button button-quiet" onClick={() => setRoomTypeForm({ ...roomTypeForm, child_rates: { ...roomTypeForm.child_rates, age_groups: normalizeAgeGroupRanges(roomTypeForm.child_rates.age_groups.filter((_, itemIndex) => itemIndex !== index)) } })}>{t('hotelDetail.removeChildAgeGroup')}</button>
            </div>;
          })}
          {roomTypeForm.child_rates.age_groups.length < 3 && (roomTypeForm.child_rates.age_groups.length === 0 || Number(roomTypeForm.child_rates.age_groups.at(-1)?.max_age) < 17) && <button type="button" className="button button-quiet" onClick={() => {
            const groups = roomTypeForm.child_rates.age_groups;
            const minAge = groups.length ? Number(groups[groups.length - 1].max_age) + 1 : 3;
            const maxAge = Math.min(17, minAge + 4);
            setRoomTypeForm({ ...roomTypeForm, child_rates: { ...roomTypeForm.child_rates, age_groups: [...groups, { min_age: minAge, max_age: maxAge, mode: 'free', value: 0 }] } });
          }}>{t('hotelDetail.addChildAgeGroup')}</button>}
          <small>{t('hotelDetail.childAgeGroupsHint')}</small>
        </div>
      </> : childRateEditor(t('hotelDetail.heightChildRateLabel'), roomTypeForm.child_rates.height, (field, value) => updateChildRate('height', field, value))}
      <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={roomTypeForm.children_count_toward_max} onChange={event => setRoomTypeForm({ ...roomTypeForm, children_count_toward_max: event.target.checked })} />{t('hotelDetail.childrenCountTowardMaxLabel')}</label>
    </fieldset>;
  }
  if (isLoading) return <div className="page-content"><PageState tone="loading" title={t('hotelDetail.loadingTitle')} description={t('hotelDetail.loadingDesc')} /></div>;
  if (error || !hotel) return <div className="page-content"><PageState tone="error" title={t('hotelDetail.errorTitle')} description={error?.message ?? t('hotelDetail.errorDescFallback')} actionLabel={t('hotelDetail.retryButton')} onAction={() => void utils.channelManager.hotel.invalidate(id)} /></div>;
  const availableRooms = hotel.rooms.filter((room: any) => room.status === 'available').length;
  const lowestRate = hotel.room_types.length ? Math.min(...hotel.room_types.map((type: any) => Number(type.base_price))) : 0;
  return <div className="page-content hotel-detail-page"><div className="detail-back"><Link href="/hotels">{t('hotelDetail.backToHotels')}</Link><ChevronRight size={14} /><span>{hotel.name}</span></div><section className="property-hero"><div className="property-hero-image property-hero-monogram"><span aria-hidden="true">{hotel.name.slice(0, 1)}</span><span className={`status-pill ${hotel.public_enabled ? 'live' : 'setup'}`}><i />{hotel.public_enabled ? t('hotelDetail.livePill') : t('hotelDetail.privatePill')}</span></div><div className="property-hero-copy"><div className="eyebrow">{t('hotelDetail.propertyId', { id: hotel.id.slice(0, 8) })}</div><h1>{hotel.name}<span className="title-mark">.</span></h1><p>{hotel.address}</p><div className="property-meta"><span><Users size={15} /> {t('hotelDetail.accessControlled')}</span><span><ExternalLink size={15} /> /{hotel.slug}</span></div></div><div className="property-actions"><button className="button button-quiet" disabled title={t('hotelDetail.editPropertyTooltip')}><Pencil size={15} /> {t('hotelDetail.editProperty')}</button><div className="dropdown-anchor property-action-menu"><button className="icon-button bordered" type="button" aria-label={t('hotelDetail.morePropertyActionsAria')} aria-haspopup="menu" aria-expanded={propertyActionsOpen} onClick={() => setPropertyActionsOpen(open => !open)}><MoreHorizontal size={17} /></button>{propertyActionsOpen && <div className="menu-surface menu-surface--property-actions" role="menu" aria-label={t('hotelDetail.propertyActionsRoleAria')}><button className="menu-surface-item" type="button" disabled title={t('hotelDetail.editPropertyTooltip')}><Pencil size={14} /> {t('hotelDetail.editProperty')} <span className="menu-surface-note">{t('hotelDetail.comingSoon')}</span></button></div>}</div></div></section><nav className="detail-tabs"><Link href={`/hotels/${hotel.id}`} className="active">{t('hotelDetail.tabRoomTypes')}</Link><Link href={`/hotels/${hotel.id}/bookings`}>{t('hotelDetail.tabBookings')}</Link><Link href={`/hotels/${hotel.id}/calendar`}>{t('hotelDetail.tabAvailability')}</Link><Link href={`/hotels/${hotel.id}/services`}>{t('hotelDetail.tabServices')}</Link><a href="#" onClick={event => event.preventDefault()}>{t('hotelDetail.tabImages')}</a><a href="#" onClick={event => event.preventDefault()}>{t('hotelDetail.tabDomains')}</a></nav><section className="detail-kpis"><div><span>{t('hotelDetail.kpiRooms')}</span><strong>{hotel.rooms.length}</strong><small>{t('hotelDetail.kpiRoomsSub', { count: hotel.room_types.length })}</small></div><div><span>{t('hotelDetail.kpiAvailable')}</span><strong>{availableRooms}</strong><small className="green-text">{t('hotelDetail.kpiAvailableSub')}</small></div><div><span>{t('hotelDetail.kpiBaseRate')}</span><strong>{lowestRate ? formatCurrency(lowestRate) : '—'}</strong><small>{t('hotelDetail.kpiBaseRateSub')}</small></div><div><span>{t('hotelDetail.kpiPublicSite')}</span><strong>{hotel.public_enabled ? t('hotelDetail.livePill') : t('hotelDetail.privatePill')}</strong><small>{t('hotelDetail.kpiPublicSiteSub')}</small></div></section><section className="panel room-types-panel"><div className="panel-heading"><div><div className="eyebrow">{t('hotelDetail.eyebrowRoomTypes')}</div><h2>{t('hotelDetail.headingRoomTypes')}</h2></div><button className="button button-primary" type="button" onClick={() => { setRoomTypeError(null); setRoomTypeForm({ ...emptyRoomTypeForm, child_rule: hotel.room_types[0]?.child_rule ?? 'age' }); setShowCreateRoomType(true); }}><Plus size={16} /> {t('hotelDetail.addRoomType')}</button></div><div className="room-type-list">{hotel.room_types.length ? hotel.room_types.map((type: any) => { const rooms = hotel.rooms.filter((room: any) => room.room_type_id === type.id); const occupied = rooms.filter((room: any) => room.status !== 'available').length; const occupancy = rooms.length ? Math.round(occupied / rooms.length * 100) : 0; return <div className="room-type-row" key={type.id}><div className="room-type-icon pine"><BedDouble size={19} /></div><div className="room-type-name"><strong>{type.name}</strong><span>{t('hotelDetail.roomsAndRate', { count: rooms.length, rate: formatCurrency(type.base_price) })}</span></div><div className="room-type-occupancy"><span>{t('hotelDetail.occupied')}</span><strong>{occupancy}%</strong><div className="mini-progress"><span style={{ width: `${occupancy}%` }} /></div></div><div className="room-type-price"><span>{t('hotelDetail.baseRateLabel')}</span><strong>{formatCurrency(type.base_price)}</strong></div><RoomTypeActions roomType={type} onEdit={openEditRoomType} onDelete={openDeleteRoomType} /></div>; }) : <div className="empty-state"><BedDouble size={20} /><strong>{t('hotelDetail.noRoomTypesTitle')}</strong><span>{t('hotelDetail.noRoomTypesDesc')}</span></div>}</div></section><section className="detail-bottom-grid"><div className="panel quick-panel"><div className="eyebrow">{t('hotelDetail.quickLinks')}</div><h3>{t('hotelDetail.commonTasks')}</h3><Link href={`/hotels/${hotel.id}/calendar`}><span className="quick-icon"><CalendarDays size={16} /></span><span><strong>{t('hotelDetail.updateAvailabilityTitle')}</strong><small>{t('hotelDetail.updateAvailabilityDesc')}</small></span><ArrowUpRight size={15} /></Link><Link href={`/hotels/${hotel.id}/bookings`}><span className="quick-icon"><Users size={16} /></span><span><strong>{t('hotelDetail.reviewBookingsTitle')}</strong><small>{t('hotelDetail.reviewBookingsDesc')}</small></span><ArrowUpRight size={15} /></Link></div><div className="panel checklist-panel"><div className="eyebrow">{t('hotelDetail.propertySetup')}</div><h3>{hotel.public_enabled ? t('hotelDetail.publiclyAvailable') : t('hotelDetail.privateWorkspace')}</h3><div className="checklist-row"><span className="check-circle"><Check size={13} /></span><span>{t('hotelDetail.checkMembership')}</span><small>{t('hotelDetail.checkMembershipBadge')}</small></div><div className="checklist-row"><span className="check-circle"><Check size={13} /></span><span>{t('hotelDetail.checkInventory')}</span><small>{t('hotelDetail.checkInventoryBadge')}</small></div><div className="checklist-row"><span className="check-circle"><Check size={13} /></span><span>{t('hotelDetail.checkPublic')}</span><small>{hotel.public_enabled ? t('hotelDetail.livePill') : t('hotelDetail.privatePill')}</small></div>{canPublish && <div className="publish-control"><p className="subtle-block">{hotel.public_enabled ? t('hotelDetail.unpublishHint', { slug: hotel.slug }) : t('hotelDetail.publishHint', { slug: hotel.slug })}</p><button id="hotel-publish-toggle" className={`button ${hotel.public_enabled ? 'button-quiet' : 'button-primary'}`} type="button" disabled={setPublished.isPending} onClick={() => togglePublished(!hotel.public_enabled)}>{setPublished.isPending ? t('hotelDetail.publishSaving') : hotel.public_enabled ? t('hotelDetail.unpublish') : t('hotelDetail.publish')}</button>{publishError && <p className="form-error" role="alert">{publishError}</p>}</div>}</div></section>
    <Dialog open={showCreateRoomType} onOpenChange={closeRoomTypeDialog}>
      <DialogContent className="modal-card">
        <DialogHeader className="modal-head"><div><div className="eyebrow">{t('hotelDetail.newRoomTypeEyebrow')}</div><DialogTitle>{t('hotelDetail.newRoomTypeTitle')}</DialogTitle><DialogDescription className="modal-lede">{t('hotelDetail.newRoomTypeDesc', { name: hotel.name })}</DialogDescription></div></DialogHeader>
        <form onSubmit={submitCreateRoomType}>
          {roomTypeError && <p className="form-error" role="alert">{roomTypeError}</p>}
          <div className="form-grid">
            <label className="form-span-two">{t('hotelDetail.roomTypeNameLabel')}<input autoFocus required value={roomTypeForm.name} onChange={event => setRoomTypeForm({ ...roomTypeForm, name: event.target.value })} placeholder={t('hotelDetail.roomTypeNamePlaceholder')} /></label>
            <label>{t('hotelDetail.basePriceLabel')}<input required min="0.01" step="0.01" type="number" value={roomTypeForm.base_price} onChange={event => setRoomTypeForm({ ...roomTypeForm, base_price: event.target.value })} placeholder={t('hotelDetail.basePricePlaceholder')} /></label>
            <label>{t('hotelDetail.quantityLabel')}<input required min="1" step="1" type="number" value={roomTypeForm.quantity} onChange={event => setRoomTypeForm({ ...roomTypeForm, quantity: event.target.value })} placeholder={t('hotelDetail.quantityPlaceholder')} /></label>
            {occupancyPricingFields()}
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
            <label>{t('hotelDetail.basePriceLabel')}<input required min="0.01" step="0.01" type="number" value={roomTypeForm.base_price} onChange={event => setRoomTypeForm({ ...roomTypeForm, base_price: event.target.value })} placeholder={t('hotelDetail.basePricePlaceholder')} /></label>
            {occupancyPricingFields()}
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


