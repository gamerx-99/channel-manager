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

const emptyHotelForm = { name: '', slug: '', address: '', owner_contact: '', public_enabled: false };
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function Hotels() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'All properties' | 'Live' | 'Private'>('All properties');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyHotelForm);
  const [formError, setFormError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: hotels = [], isLoading, error } = trpc.channelManager.hotels.useQuery();
  const canCreateHotel = trpc.channelManager.canCreateHotel.useQuery();
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
  const totalRooms = hotels.reduce((total, hotel) => total + hotel.rooms.length, 0);
  const liveCount = hotels.filter(hotel => hotel.public_enabled).length;

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
      setFormError('Enter the hotel name, slug, address, and owner contact.');
      return;
    }
    if (!slugPattern.test(slug)) {
      setFormError('Use a lowercase slug with letters, numbers, and hyphens only.');
      return;
    }
    createHotel.mutate({ name, slug, address, owner_contact: ownerContact, public_enabled: form.public_enabled });
  }

  return <div className="page-content"><section className="page-intro intro-split"><div><div className="eyebrow">Portfolio / Directory</div><h1>Hotels<span className="title-mark">.</span></h1><p className="lede">A live, RLS-scoped operating view across the properties available to your account.</p></div>{canCreateHotel.data && <button className="button button-primary" type="button" onClick={() => { setFormError(null); setShowCreate(true); }}><Plus size={16} /> Add hotel</button>}</section>
    <section className="summary-strip"><div><span className="strip-label">Total properties</span><strong>{hotels.length}</strong></div><div><span className="strip-label">Rooms under management</span><strong>{totalRooms}</strong></div><div><span className="strip-label">Publicly live</span><strong>{liveCount}</strong></div><div className="strip-caption"><HotelIcon size={16} /> Results are returned by Supabase row-level security.</div></section>
    <section className="panel list-panel"><div className="list-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search hotels" aria-label="ค้นหาโรงแรม" /></div><div className="toolbar-actions"><button className={`filter-button ${filter === 'All properties' ? 'selected' : ''}`} onClick={() => setFilter('All properties')}><SlidersHorizontal size={15} /> All properties</button><button className={`filter-button ${filter === 'Live' ? 'selected' : ''}`} onClick={() => setFilter('Live')}><span className="dot pine" /> Live</button><button className={`filter-button ${filter === 'Private' ? 'selected' : ''}`} onClick={() => setFilter('Private')}><Filter size={14} /> Private</button></div></div>
      <div className="hotel-directory-head"><span>Property</span><span>Access</span><span>Rooms</span><span>Occupancy</span><span>Status</span><span /></div><div className="directory-list">{isLoading ? <div className="empty-state">Loading Supabase records…</div> : error ? <div className="empty-state"><strong>Unable to load hotels</strong><span>{error.message}</span></div> : filtered.map(hotel => { const occupied = hotel.rooms.filter(room => room.status !== 'available').length; const occupancy = hotel.rooms.length ? Math.round(occupied / hotel.rooms.length * 100) : 0; return <Link className="directory-row" href={`/hotels/${hotel.id}`} key={hotel.id}><div className="directory-property"><div className="hotel-thumb large hotel-thumb-initial" aria-hidden="true">{hotel.name.slice(0, 1)}</div><div><strong>{hotel.name}</strong><span>{hotel.address}</span></div></div><div className="directory-owner"><div className="owner-avatar">RLS</div><span>Member access</span></div><div><strong>{hotel.rooms.length}</strong><span className="subtle-block">total rooms</span></div><div className="occupancy-cell"><strong>{occupancy}%</strong><div className="mini-progress"><span style={{ width: `${occupancy}%` }} /></div></div><div><span className={`status-pill ${hotel.public_enabled ? 'live' : 'setup'}`}><i />{hotel.public_enabled ? 'Live' : 'Private'}</span></div><ArrowUpRight size={16} className="row-arrow" /></Link>; })}</div>
      {!isLoading && !error && filtered.length === 0 && <div className="empty-state"><HotelIcon size={20} /><strong>No properties found</strong><span>There are no RLS-visible hotel records matching this view.</span></div>}</section><p className="page-footnote"><span className="dot pine" /> Data access is governed by hotel_users and row-level security in Supabase PostgreSQL.</p>
    <Dialog open={showCreate} onOpenChange={closeCreateDialog}>
      <DialogContent className="modal-card">
        <DialogHeader className="modal-head"><div><div className="eyebrow">Portfolio / New property</div><DialogTitle>Add a hotel</DialogTitle><DialogDescription className="modal-lede">Create the property record first. Owner membership is assigned separately by an administrator.</DialogDescription></div></DialogHeader>
        <form onSubmit={submitCreateHotel}>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="form-grid">
            <label>Hotel name<input autoFocus required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Enter hotel name" /></label>
            <label>Public slug<input required value={form.slug} onChange={event => setForm({ ...form, slug: event.target.value.toLowerCase() })} placeholder="e.g. city-hotel" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label>
            <label className="form-span-two">Address<input required value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} placeholder="Property address" /></label>
            <label className="form-span-two">Owner contact<input required value={form.owner_contact} onChange={event => setForm({ ...form, owner_contact: event.target.value })} placeholder="Name, email, or phone" /></label>
          </div>
          <label className="dialog-checkbox"><input type="checkbox" checked={form.public_enabled} onChange={event => setForm({ ...form, public_enabled: event.target.checked })} /><span><strong>Enable public page</strong><small>Allow the public RPC to expose this property.</small></span></label>
          <DialogFooter className="modal-actions"><button className="button button-quiet" type="button" onClick={() => closeCreateDialog(false)} disabled={createHotel.isPending}>Cancel</button><button className="button button-primary" type="submit" disabled={createHotel.isPending}>{createHotel.isPending ? 'Creating…' : 'Create hotel'}</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
