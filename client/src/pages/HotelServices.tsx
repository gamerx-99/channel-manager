import { ChevronRight, ExternalLink, MoreHorizontal, Pencil, Plus, Sparkles, Users } from 'lucide-react';
import { Link } from 'wouter';
import { FormEvent, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import type { PricingModel as HotelServicePricingModel } from '@shared/pricingModels';

const formatCurrency = (value: number | string) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(Number(value));

const emptyServiceForm = {
  name: '',
  pricing_model: 'ONE_TIME' as HotelServicePricingModel,
  unit_price: '',
  is_active: true,
};

type Service = { id: string; hotel_id: string; name: string; pricing_model: HotelServicePricingModel; unit_price: number | string; is_active: boolean };

const PRICING_MODEL_OPTIONS: HotelServicePricingModel[] = ['ONE_TIME', 'PER_NIGHT', 'PER_PERSON_PER_NIGHT'];

export default function HotelServices({ id }: { id: string }) {
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [propertyActionsOpen, setPropertyActionsOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: hotel, isLoading: hotelLoading, error: hotelError } = trpc.channelManager.hotel.useQuery(id, { enabled: Boolean(id) });
  const { data: services, isLoading: servicesLoading, error: servicesError } = trpc.channelManager.listHotelServicesProcedure.useQuery(id, { enabled: Boolean(id) });

  const createService = trpc.channelManager.createHotelServiceProcedure.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.channelManager.listHotelServicesProcedure.invalidate(id),
        utils.channelManager.hotels.invalidate(),
        utils.channelManager.dashboard.invalidate(),
      ]);
      setShowCreate(false);
      setServiceForm(emptyServiceForm);
      setServiceError(null);
    },
    onError: mutationError => setServiceError(mutationError.message),
  });

  const updateService = trpc.channelManager.updateHotelServiceProcedure.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.channelManager.listHotelServicesProcedure.invalidate(id),
        utils.channelManager.hotels.invalidate(),
        utils.channelManager.dashboard.invalidate(),
      ]);
      setShowEdit(false);
      setSelectedServiceId(null);
      setServiceForm(emptyServiceForm);
      setServiceError(null);
    },
    onError: mutationError => setServiceError(mutationError.message),
  });

  const deleteService = trpc.channelManager.deleteHotelServiceProcedure.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.channelManager.listHotelServicesProcedure.invalidate(id),
        utils.channelManager.hotels.invalidate(),
        utils.channelManager.dashboard.invalidate(),
      ]);
      setShowDelete(false);
      setSelectedServiceId(null);
      setServiceError(null);
    },
    onError: mutationError => setServiceError(mutationError.message),
  });

  function closeCreateDialog(open: boolean) {
    if (createService.isPending) return;
    setShowCreate(open);
    if (!open) setServiceError(null);
  }

  function closeEditDialog(open: boolean) {
    if (updateService.isPending) return;
    setShowEdit(open);
    if (!open) {
      setSelectedServiceId(null);
      setServiceError(null);
    }
  }

  function openEditService(service: Service) {
    setSelectedServiceId(service.id);
    setServiceForm({
      name: service.name,
      pricing_model: service.pricing_model,
      unit_price: String(service.unit_price),
      is_active: service.is_active,
    });
    setServiceError(null);
    setShowEdit(true);
  }

  function openDeleteService(service: Service) {
    setSelectedServiceId(service.id);
    setServiceError(null);
    setShowDelete(true);
  }

  function validateServiceForm() {
    const name = serviceForm.name.trim();
    const unitPrice = Number(serviceForm.unit_price);
    if (!name) {
      setServiceError(t('hotelServices.errorNameRequired'));
      return null;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setServiceError(t('hotelServices.errorPriceInvalid'));
      return null;
    }
    return { name, pricing_model: serviceForm.pricing_model, unit_price: unitPrice };
  }

  function submitCreateService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServiceError(null);
    const values = validateServiceForm();
    if (!values) return;
    createService.mutate({ hotel_id: id, ...values });
  }

  function submitEditService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServiceError(null);
    if (!selectedServiceId) {
      setServiceError(t('hotelServices.errorSelectToEdit'));
      return;
    }
    const values = validateServiceForm();
    if (!values) return;
    updateService.mutate({ hotel_id: id, service_id: selectedServiceId, ...values, is_active: serviceForm.is_active });
  }

  function confirmDeleteService() {
    if (!selectedServiceId || deleteService.isPending) return;
    setServiceError(null);
    deleteService.mutate({ hotel_id: id, service_id: selectedServiceId });
  }

  function pricingModelLabel(model: HotelServicePricingModel) {
    return t(`hotelServices.pricingModel${model === 'ONE_TIME' ? 'OneTime' : model === 'PER_NIGHT' ? 'PerNight' : 'PerPersonPerNight'}`);
  }

  const isLoading = hotelLoading || servicesLoading;
  const error = hotelError ?? servicesError;

  if (isLoading) {
    return <div className="page-content"><PageState tone="loading" title={t('hotelServices.loadingTitle')} description={t('hotelServices.loadingDesc')} /></div>;
  }
  if (error || !hotel) {
    return <div className="page-content"><PageState tone="error" title={t('hotelServices.errorTitle')} description={error?.message ?? t('hotelServices.errorDescFallback')} actionLabel={t('hotelServices.retryButton')} onAction={() => { void utils.channelManager.hotel.invalidate(id); void utils.channelManager.listHotelServicesProcedure.invalidate(id); }} /></div>;
  }

  return (
    <div className="page-content hotel-detail-page">
      <div className="detail-back"><Link href="/hotels">{t('hotelDetail.backToHotels')}</Link><ChevronRight size={14} /><span>{hotel.name}</span></div>
      <section className="property-hero">
        <div className="property-hero-image property-hero-monogram"><span aria-hidden="true">{hotel.name.slice(0, 1)}</span><span className={`status-pill ${hotel.public_enabled ? 'live' : 'setup'}`}><i />{hotel.public_enabled ? t('hotelDetail.livePill') : t('hotelDetail.privatePill')}</span></div>
        <div className="property-hero-copy">
          <div className="eyebrow">{t('hotelDetail.propertyId', { id: hotel.id.slice(0, 8) })}</div>
          <h1>{hotel.name}<span className="title-mark">.</span></h1>
          <p>{hotel.address}</p>
          <div className="property-meta"><span><Users size={15} /> {t('hotelDetail.accessControlled')}</span><span><ExternalLink size={15} /> /{hotel.slug}</span></div>
        </div>
        <div className="property-actions">
          <button className="button button-quiet" disabled title={t('hotelDetail.editPropertyTooltip')}><Pencil size={15} /> {t('hotelDetail.editProperty')}</button>
          <div className="dropdown-anchor property-action-menu">
            <button className="icon-button bordered" type="button" aria-label={t('hotelDetail.morePropertyActionsAria')} aria-haspopup="menu" aria-expanded={propertyActionsOpen} onClick={() => setPropertyActionsOpen(open => !open)}><MoreHorizontal size={17} /></button>
            {propertyActionsOpen && <div className="menu-surface menu-surface--property-actions" role="menu" aria-label={t('hotelDetail.propertyActionsRoleAria')}><button className="menu-surface-item" type="button" disabled title={t('hotelDetail.editPropertyTooltip')}><Pencil size={14} /> {t('hotelDetail.editProperty')} <span className="menu-surface-note">{t('hotelDetail.comingSoon')}</span></button></div>}
          </div>
        </div>
      </section>
      <nav className="detail-tabs">
        <Link href={`/hotels/${hotel.id}`}>{t('hotelDetail.tabRoomTypes')}</Link>
        <Link href={`/hotels/${hotel.id}/bookings`}>{t('hotelDetail.tabBookings')}</Link>
        <Link href={`/hotels/${hotel.id}/calendar`}>{t('hotelDetail.tabAvailability')}</Link>
        <Link href={`/hotels/${hotel.id}/services`} className="active">{t('hotelDetail.tabServices')}</Link>
        <a href="#" onClick={event => event.preventDefault()}>{t('hotelDetail.tabImages')}</a>
        <a href="#" onClick={event => event.preventDefault()}>{t('hotelDetail.tabDomains')}</a>
      </nav>
      <section className="panel room-types-panel">
        <div className="panel-heading">
          <div><div className="eyebrow">{t('hotelServices.eyebrow')}</div><h2>{t('hotelServices.title')}</h2></div>
          <button className="button button-primary" type="button" onClick={() => { setServiceError(null); setShowCreate(true); }}><Plus size={16} /> {t('hotelServices.addService')}</button>
        </div>
        {services && services.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>{t('hotelServices.colName')}</th><th>{t('hotelServices.colPricingModel')}</th><th className="align-right">{t('hotelServices.colPrice')}</th><th>{t('hotelServices.colActive')}</th><th /></tr></thead>
              <tbody>
                {services.map(service => (
                  <tr key={service.id}>
                    <td><strong>{service.name}</strong></td>
                    <td>{pricingModelLabel(service.pricing_model)}</td>
                    <td className="align-right">{formatCurrency(service.unit_price)}</td>
                    <td><span className={`status-pill ${service.is_active ? 'live' : 'setup'}`}><i />{service.is_active ? t('hotelServices.activeYes') : t('hotelServices.activeNo')}</span></td>
                    <td className="align-right"><RoomTypeActions roomType={service} onEdit={openEditService} onDelete={openDeleteService} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Sparkles size={20} />
            <strong>{t('hotelServices.noServicesTitle')}</strong>
            <span>{t('hotelServices.noServicesDesc')}</span>
          </div>
        )}
      </section>

      <Dialog open={showCreate} onOpenChange={closeCreateDialog}>
        <DialogContent className="modal-card">
          <DialogHeader className="modal-head"><div><div className="eyebrow">{t('hotelServices.createEyebrow')}</div><DialogTitle>{t('hotelServices.createTitle')}</DialogTitle><DialogDescription className="modal-lede">{t('hotelServices.createDesc', { name: hotel.name })}</DialogDescription></div></DialogHeader>
          <form onSubmit={submitCreateService}>
            {serviceError && <p className="form-error" role="alert">{serviceError}</p>}
            <div className="form-grid">
              <label className="form-span-two">{t('hotelServices.nameLabel')}<input autoFocus required value={serviceForm.name} onChange={event => setServiceForm({ ...serviceForm, name: event.target.value })} placeholder={t('hotelServices.namePlaceholder')} /></label>
              <label>{t('hotelServices.pricingModelLabel')}
                <select value={serviceForm.pricing_model} onChange={event => setServiceForm({ ...serviceForm, pricing_model: event.target.value as HotelServicePricingModel })}>
                  {PRICING_MODEL_OPTIONS.map(model => <option key={model} value={model}>{pricingModelLabel(model)}</option>)}
                </select>
              </label>
              <label>{t('hotelServices.priceLabel')}<input required min="0" step="0.01" type="number" value={serviceForm.unit_price} onChange={event => setServiceForm({ ...serviceForm, unit_price: event.target.value })} placeholder={t('hotelServices.pricePlaceholder')} /></label>
            </div>
            <DialogFooter className="modal-actions"><button className="button button-quiet" type="button" onClick={() => closeCreateDialog(false)} disabled={createService.isPending}>{t('hotelServices.cancel')}</button><button className="button button-primary" type="submit" disabled={createService.isPending}>{createService.isPending ? t('hotelServices.creating') : t('hotelServices.createButton')}</button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={closeEditDialog}>
        <DialogContent className="modal-card">
          <DialogHeader className="modal-head"><div><div className="eyebrow">{t('hotelServices.editEyebrow')}</div><DialogTitle>{t('hotelServices.editTitle')}</DialogTitle><DialogDescription className="modal-lede">{t('hotelServices.editDesc', { name: hotel.name })}</DialogDescription></div></DialogHeader>
          <form onSubmit={submitEditService}>
            {serviceError && <p className="form-error" role="alert">{serviceError}</p>}
            <div className="form-grid">
              <label className="form-span-two">{t('hotelServices.nameLabel')}<input autoFocus required value={serviceForm.name} onChange={event => setServiceForm({ ...serviceForm, name: event.target.value })} placeholder={t('hotelServices.namePlaceholder')} /></label>
              <label>{t('hotelServices.pricingModelLabel')}
                <select value={serviceForm.pricing_model} onChange={event => setServiceForm({ ...serviceForm, pricing_model: event.target.value as HotelServicePricingModel })}>
                  {PRICING_MODEL_OPTIONS.map(model => <option key={model} value={model}>{pricingModelLabel(model)}</option>)}
                </select>
              </label>
              <label>{t('hotelServices.priceLabel')}<input required min="0" step="0.01" type="number" value={serviceForm.unit_price} onChange={event => setServiceForm({ ...serviceForm, unit_price: event.target.value })} placeholder={t('hotelServices.pricePlaceholder')} /></label>
              <label className="checkbox-field"><input type="checkbox" checked={serviceForm.is_active} onChange={event => setServiceForm({ ...serviceForm, is_active: event.target.checked })} /> {t('hotelServices.activeLabel')}</label>
            </div>
            <DialogFooter className="modal-actions"><button className="button button-quiet" type="button" onClick={() => closeEditDialog(false)} disabled={updateService.isPending}>{t('hotelServices.cancel')}</button><button className="button button-primary" type="submit" disabled={updateService.isPending}>{updateService.isPending ? t('hotelServices.saving') : t('hotelServices.saveButton')}</button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDelete} onOpenChange={open => { if (deleteService.isPending) return; setShowDelete(open); if (!open) { setSelectedServiceId(null); setServiceError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('hotelServices.deleteTitle')}</AlertDialogTitle><AlertDialogDescription>{serviceError ?? t('hotelServices.deleteDesc')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={deleteService.isPending}>{t('hotelServices.cancel')}</AlertDialogCancel><AlertDialogAction onClick={event => { event.preventDefault(); confirmDeleteService(); }} disabled={deleteService.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{deleteService.isPending ? t('hotelServices.deleting') : t('hotelServices.deleteButton')}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
