import { ArrowUpRight, Filter, Hotel as HotelIcon, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Link } from 'wouter';
import { FormEvent, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import { useTranslation } from '@/lib/i18n';
import { canAccessPlatformSummary, shouldShowPlatformHotelEmptyState } from '@/lib/adminUsers';

// ASSUMPTION: platform users without hotel memberships get an explanation and a link to the summary directory.

const emptyHotelForm = { name: '', slug: '', address: '', owner_contact: '', public_enabled: false };
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function Hotels() {
  const { t } = useTranslation();
  const authMe = trpc.auth.me.useQuery();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'All properties' | 'Live' | 'Private'>('All properties');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyHotelForm);
  const [formError, setFormError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: hotels = [], isLoading, error } = trpc.channelManager.hotels.useQuery();
  const canCreateHotel = trpc.channelManager.canCreateHotel.useQuery();
  const showPlatformHotelEmptyState = shouldShowPlatformHotelEmptyState({
    roles: authMe.data?.roles ?? [], memberships: authMe.data?.memberships ?? [],
    hotelCount: hotels.length, isLoading: isLoading || authMe.isLoading, hasError: Boolean(error),
  });
  const canOpenPlatformSummary = canAccessPlatformSummary(authMe.data?.roles ?? []);
  const createHotel = trpc.channelManager.createHotel.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.channelManager.hotels.invalidate(),
        utils.channelManager.dashboard.invalidate(),
        utils.channelManager.canCreateHotel.invalidate(),
      ]);
      setShowCreate(false);
      setForm(emptyHotelForm);
      setFormError(null);
    },
    onError: mutationError => setFormError(mutationError.message),
  });
  const filtered = useMemo(() => hotels.filter(hotel => hotel.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'All properties' || (filter === 'Live' ? hotel.public_enabled : !hotel.public_enabled))), [hotels, query, filter]);

  function closeCreateDialog(open: boolean) {
    if (createHotel.isPending) return;
    setShowCreate(open);
    if (!open) setFormError(null);
  }

  function submitCreateHotel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const name = form.name.trim();
    const slug = form.slug.trim().toLowerCase();
    const address = form.address.trim();
    const ownerContact = form.owner_contact.trim();
    if (!name || !slug || !address || !ownerContact) {
      setFormError(t('hotels.errorMissingFields'));
      return;
    }
    if (!slugPattern.test(slug)) {
      setFormError(t('hotels.errorInvalidSlug'));
      return;
    }
    createHotel.mutate({ name, slug, address, owner_contact: ownerContact, public_enabled: form.public_enabled });
  }

  if (hotels.length === 0 && (isLoading || authMe.isLoading)) return <div className="page-content"><section className="page-intro intro-split"><div><div className="eyebrow">{t('hotels.eyebrow')}</div><h1>{t('hotels.title')}<span className="title-mark">.</span></h1><p className="lede">{t('hotels.lede')}</p></div></section><section className="panel empty-state">{t('hotels.loadingRecords')}</section></div>;

  if (showPlatformHotelEmptyState) return <div className="page-content"><section className="page-intro intro-split"><div><div className="eyebrow">{t('hotels.eyebrow')}</div><h1>{t('hotels.title')}<span className="title-mark">.</span></h1><p className="lede">{t('hotels.lede')}</p></div></section><section className="panel empty-state"><HotelIcon size={20} /><strong>{t('hotels.platformMembershipTitle')}</strong><span>{t('hotels.platformMembershipDescription')}</span>{canOpenPlatformSummary && <Link className="button button-primary" href="/platform">{t('hotels.platformDirectoryLink')}</Link>}</section></div>;

  return <div className="page-content"><section className="page-intro intro-split"><div><div className="eyebrow">{t('hotels.eyebrow')}</div><h1>{t('hotels.title')}<span className="title-mark">.</span></h1><p className="lede">{t('hotels.lede')}</p></div>{canCreateHotel.data && <button className="button button-primary" type="button" onClick={() => { setFormError(null); setShowCreate(true); }}><Plus size={16} /> {t('hotels.addHotel')}</button>}</section>
    <section className="panel list-panel">
      <div className="panel-heading"><div><div className="eyebrow">{t('hotels.eyebrow')}</div><h2>{t('hotels.title')}</h2></div><span className="status-pill live"><i />{t('hotels.recordsPill', { count: filtered.length })}</span></div>
      <div className="list-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('hotels.searchPlaceholder')} aria-label={t('hotels.searchAriaLabel')} /></div><div className="toolbar-actions"><button className={`filter-button ${filter === 'All properties' ? 'selected' : ''}`} onClick={() => setFilter('All properties')}><SlidersHorizontal size={15} /> {t('hotels.allProperties')}</button><button className={`filter-button ${filter === 'Live' ? 'selected' : ''}`} onClick={() => setFilter('Live')}><span className="dot pine" /> {t('hotels.liveFilter')}</button><button className={`filter-button ${filter === 'Private' ? 'selected' : ''}`} onClick={() => setFilter('Private')}><Filter size={14} /> {t('hotels.privateFilter')}</button></div></div>
      <div className="table-wrap hotel-directory-wrap"><div className="hotel-directory-head"><span>{t('hotels.colProperty')}</span><span>{t('hotels.colAccess')}</span><span>{t('hotels.colRooms')}</span><span>{t('hotels.colOccupancy')}</span><span>{t('hotels.colStatus')}</span><span /></div><div className="directory-list">{isLoading ? <div className="panel empty-state">{t('hotels.loadingRecords')}</div> : error ? <div className="panel empty-state"><strong>{t('hotels.unableToLoad')}</strong><span>{error.message}</span></div> : filtered.map(hotel => { const occupied = hotel.rooms.filter(room => room.status !== 'available').length; const occupancy = hotel.rooms.length ? Math.round(occupied / hotel.rooms.length * 100) : 0; return <Link className="directory-row" href={`/hotels/${hotel.id}`} key={hotel.id}><div className="directory-property"><div className="hotel-thumb large hotel-thumb-initial" aria-hidden="true">{hotel.name.slice(0, 1)}</div><div><strong>{hotel.name}</strong><span>{hotel.address}</span></div></div><div className="directory-owner"><div className="owner-avatar">RLS</div><span>{t('hotels.memberAccess')}</span></div><div><strong>{hotel.rooms.length}</strong><span className="subtle-block">{t('hotels.totalRooms')}</span></div><div className="occupancy-cell"><strong>{occupancy}%</strong><div className="mini-progress"><span style={{ width: `${occupancy}%` }} /></div></div><div><span className={`status-pill ${hotel.public_enabled ? 'live' : 'setup'}`}><i />{hotel.public_enabled ? t('hotels.livePill') : t('hotels.privatePill')}</span></div><ArrowUpRight size={16} className="row-arrow" /></Link>; })}</div></div>
      {!isLoading && !error && filtered.length === 0 && <div className="panel empty-state"><HotelIcon size={20} /><strong>{t('hotels.noPropertiesTitle')}</strong><span>{t('hotels.noPropertiesDesc')}</span></div>}
    </section><p className="page-footnote"><span className="dot pine" /> {t('hotels.footnote')}</p>
    <Dialog open={showCreate} onOpenChange={closeCreateDialog}>
      <DialogContent className="modal-card">
        <DialogHeader className="modal-head"><div><div className="eyebrow">{t('hotels.modalEyebrow')}</div><DialogTitle>{t('hotels.modalTitle')}</DialogTitle><DialogDescription className="modal-lede">{t('hotels.modalDesc')}</DialogDescription></div></DialogHeader>
        <form onSubmit={submitCreateHotel}>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="form-grid">
            <label>{t('hotels.hotelNameLabel')}<input autoFocus required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder={t('hotels.hotelNamePlaceholder')} /></label>
            <label>{t('hotels.slugLabel')}<input required value={form.slug} onChange={event => setForm({ ...form, slug: event.target.value.toLowerCase() })} placeholder={t('hotels.slugPlaceholder')} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label>
            <label className="form-span-two">{t('hotels.addressLabel')}<input required value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} placeholder={t('hotels.addressPlaceholder')} /></label>
            <label className="form-span-two">{t('hotels.ownerContactLabel')}<input required value={form.owner_contact} onChange={event => setForm({ ...form, owner_contact: event.target.value })} placeholder={t('hotels.ownerContactPlaceholder')} /></label>
          </div>
          <label className="dialog-checkbox"><input type="checkbox" checked={form.public_enabled} onChange={event => setForm({ ...form, public_enabled: event.target.checked })} /><span><strong>{t('hotels.enablePublicLabel')}</strong><small>{t('hotels.enablePublicSub')}</small></span></label>
          <DialogFooter className="modal-actions form-submit"><button className="button button-quiet" type="button" onClick={() => closeCreateDialog(false)} disabled={createHotel.isPending}>{t('hotels.cancel')}</button><button className="button button-primary" type="submit" disabled={createHotel.isPending}>{createHotel.isPending ? t('hotels.creating') : t('hotels.createHotel')}</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
