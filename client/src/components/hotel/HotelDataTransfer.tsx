import React, { useRef } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useHotelDataTransfer } from './useHotelDataTransfer';
import './HotelDataTransfer.css';

export function HotelDataTransfer({ hotelId, slug }: { hotelId: string; slug: string }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const transfer = useHotelDataTransfer(hotelId, slug);
  return <section className="panel hotel-data-transfer" aria-labelledby="hotel-data-transfer-title">
    <div className="panel-heading"><div><div className="eyebrow">{t('hotelDataTransfer.eyebrow')}</div><h2 id="hotel-data-transfer-title">{t('hotelDataTransfer.title')}</h2></div></div>
    <p className="field-help">{t('hotelDataTransfer.description')}</p>
    <div className="hotel-data-transfer__actions">
      <button className="button button-primary" type="button" onClick={transfer.download} disabled={transfer.busy}>{t('hotelDataTransfer.export')}</button>
      <button className="button button-quiet" type="button" onClick={() => input.current?.click()} disabled={transfer.busy}>{t('hotelDataTransfer.import')}</button>
      <input ref={input} className="hotel-data-transfer__file" type="file" accept=".json,application/json" aria-label={t('hotelDataTransfer.chooseFile')} onChange={event => { transfer.chooseFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
    </div>
    {transfer.error && <p className="form-error" role="alert">{transfer.error}</p>}
    {transfer.changes && <div className="hotel-data-transfer__preview" aria-live="polite">
      <h3>{t('hotelDataTransfer.previewTitle')}</h3>
      <p className="field-help">{t('hotelDataTransfer.websiteDraftNotice')}</p>
      {transfer.changes.length ? <ul>{transfer.changes.map((change, index) => <li key={`${change.section}-${change.name}-${index}`}><strong>{t(`hotelDataTransfer.${change.section}` as never)}</strong>: {t(`hotelDataTransfer.${change.action}` as never)} — {change.name}{change.detail ? ` (${change.detail})` : ''}</li>)}</ul> : <p>{t('hotelDataTransfer.noChanges')}</p>}
      <div className="hotel-data-transfer__actions"><button className="button button-primary" type="button" onClick={transfer.confirm} disabled={transfer.busy}>{t('hotelDataTransfer.confirm')}</button><button className="button button-quiet button-small" type="button" onClick={transfer.cancel} disabled={transfer.busy}>{t('hotelDataTransfer.cancel')}</button></div>
    </div>}
  </section>;
}
