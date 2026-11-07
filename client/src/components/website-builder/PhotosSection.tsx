import { useTranslation } from "@/lib/i18n";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HotelMediaItem } from "@/components/website-builder/useWebsiteBuilder";
import { movePhotoToIndex } from "@/components/website-builder/photoReorder";
import { formatFocalPoint, parseFocalPoint, pointFromPointer } from "./focalPoint";
import { useState, type CSSProperties, type PointerEvent, type RefObject } from "react";

export type BuilderMediaItem = HotelMediaItem & { isGallerySelected?: boolean };

interface PhotosSectionProps {
  canManage: boolean;
  media: unknown[];
  /** Cover first, then the gallery in draft order. */
  orderedPhotos: BuilderMediaItem[];
  /** Photos not on the website. */
  otherPhotos: BuilderMediaItem[];
  hasCover: boolean;
  selectedGalleryIds: string[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  focalMediaId: string | null;
  setFocalMediaId: (id: string | null) => void;
  handleUploadFiles: (files: FileList | null) => void;
  handleFocalPoint: (mediaId: string, objectPosition: string | null) => Promise<boolean>;
  handleSetHero: (id: string) => void;
  handleDeleteMedia: (id: string) => void;
  handleSetCaption: (id: string, caption: string) => void;
  handleToggleGallery: (id: string, checked: boolean) => void;
  handleReorderPhotos: (ids: string[]) => void;
  photoError?: string | null;
}

type PhotoCardProps = Pick<PhotosSectionProps, "canManage" | "focalMediaId" | "setFocalMediaId" | "handleFocalPoint" | "handleSetHero" | "handleDeleteMedia" | "handleSetCaption" | "handleToggleGallery"> & {
  item: BuilderMediaItem;
  /** 1-based place on the website, or null for a photo that is not shown. */
  position: number | null;
  orderCount: number;
  hasCover: boolean;
  onMove: (id: string, toIndex: number) => void;
};

function PhotoCard({ item, position, orderCount, hasCover, onMove, canManage, focalMediaId, setFocalMediaId, handleFocalPoint, handleSetHero, handleDeleteMedia, handleSetCaption, handleToggleGallery }: PhotoCardProps) {
  const { t } = useTranslation();
  const [draftPosition, setDraftPosition] = useState<string | null>(item.objectPosition);
  const [isSaving, setIsSaving] = useState(false);
  const name = item.caption?.trim() || t("websiteBuilder.photoFallback", { order: item.displayOrder + 1 });
  const placeLabel = position === null ? t("websiteBuilder.notOnWebsiteLabel") : item.isHero ? t("websiteBuilder.heroImageLabel") : t("websiteBuilder.galleryLabel");
  const isEditing = focalMediaId === item.id;
  const point = parseFocalPoint(draftPosition);
  const previewStyle = { "--wb-object-position": formatFocalPoint(point) } as CSSProperties;
  const markerStyle = { "--wb-focal-x": `${point.x}%`, "--wb-focal-y": `${point.y}%` } as CSSProperties;
  function updateFromPointer(event: PointerEvent<HTMLDivElement>) {
    setDraftPosition(formatFocalPoint(pointFromPointer(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())));
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event);
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  async function savePosition() {
    setIsSaving(true);
    try {
      if (await handleFocalPoint(item.id, draftPosition)) setFocalMediaId(null);
    } finally {
      setIsSaving(false);
    }
  }
  return (
    <div className="group min-w-0 overflow-hidden rounded-xl border border-[#e6eee9] bg-white" data-photo-id={item.id}>
      <div className="relative aspect-[16/10] overflow-hidden bg-[#f6faf7]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={item.caption ?? "Hotel media preview"}
          className="wb-card-image h-full w-full object-cover wb-object-position"
          style={item.objectPosition ? { "--wb-object-position": item.objectPosition } as CSSProperties : undefined}
        />
        {item.isHero && (
          <span className="absolute left-2 top-2 rounded-full bg-[#1d6b56] px-2 py-0.5 text-[11px] font-semibold text-white">
            {t("websiteBuilder.heroBadge")}
          </span>
        )}
      </div>
      {isEditing && (
        <div className="space-y-2 border-t border-[#e6eee9] p-3">
          <p className="text-xs font-medium">{t("websiteBuilder.chooseFocalPoint")}</p>
          <div className="wb-focal-editor relative aspect-[4/3] overflow-hidden rounded bg-slate-100" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <img src={item.url} alt="" draggable={false} className="pointer-events-none h-full w-full select-none object-cover wb-object-position" style={previewStyle} />
            <span className="pointer-events-none absolute z-[2] h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-600 shadow wb-focal-marker" style={markerStyle} />
          </div>
          <div className="wb-focal-sliders">
            <label>{t("websiteBuilder.horizontal")}<input type="range" min="0" max="100" value={point.x} disabled={!canManage} onChange={event => setDraftPosition(formatFocalPoint({ ...point, x: Number(event.currentTarget.value) }))} /></label>
            <label>{t("websiteBuilder.vertical")}<input type="range" min="0" max="100" value={point.y} disabled={!canManage} onChange={event => setDraftPosition(formatFocalPoint({ ...point, y: Number(event.currentTarget.value) }))} /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="aspect-[16/7] overflow-hidden rounded bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt=""
                className="h-full w-full object-cover wb-object-position"
                style={previewStyle}
              />
            </div>
            <div className="aspect-[4/3] overflow-hidden rounded bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt=""
                className="h-full w-full object-cover wb-object-position"
                style={previewStyle}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="wb-photo-action" disabled={!canManage || isSaving} onClick={() => setDraftPosition(null)}>
              {t("websiteBuilder.resetFocalPoint")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="wb-photo-action" disabled={isSaving} onClick={() => setFocalMediaId(null)}>{t("common.cancel")}</Button>
            <Button type="button" size="sm" className="wb-photo-action" disabled={!canManage || isSaving} onClick={() => { void savePosition(); }}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      )}
      <div className="wb-photo-footer p-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-[#2a4035]">{placeLabel}</p>
        </div>
        {position !== null && <label className="wb-order-label text-xs text-[#52655b]">{t("websiteBuilder.orderLabel")}
          <select className="wb-order-select rounded-md border border-[#dce4df] bg-white px-2 text-sm" value={position} disabled={!canManage || orderCount < 2} aria-label={t("websiteBuilder.orderNamedAria", { name })} onChange={event => onMove(item.id, Number(event.currentTarget.value) - 1)}>
            {Array.from({ length: orderCount }, (_, index) => <option key={index} value={index + 1}>{index === 0 && hasCover ? t("websiteBuilder.orderCoverOption") : index + 1}</option>)}
          </select>
        </label>}
        <div className="wb-photo-actions">
          <Button type="button" variant="outline" size="sm" className="wb-photo-action border-[#dce4df] px-2 text-xs" onClick={() => { setDraftPosition(item.objectPosition); setFocalMediaId(item.id); }} disabled={!canManage} aria-expanded={isEditing} aria-label={t("websiteBuilder.adjustPositionNamedAria", { name })}>{t("websiteBuilder.adjustPosition")}</Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`wb-photo-action border-[#dce4df] px-2 text-xs ${item.isHero ? "bg-[#edf7f1] text-[#1d6b56]" : "bg-white"}`}
            onClick={() => handleSetHero(item.id)}
            disabled={!canManage || item.isHero}
            aria-label={t("websiteBuilder.setHeroNamedAria", { name })}
          >
            {t("websiteBuilder.setHeroButton")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="wb-photo-action text-[#8a9a93] hover:text-red-600"
            onClick={() => handleDeleteMedia(item.id)}
            disabled={!canManage || item.isHero}
            aria-label={t("websiteBuilder.deleteNamedMediaAria", { name })}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      <div className="space-y-2 px-3 pb-3">
        <label className="block text-xs font-medium text-[#52655b]">
          {t("websiteBuilder.photoCaptionLabel")}
          <input
            // key: remount when the saved caption changes (for example after discarding the draft),
            // otherwise defaultValue keeps showing the old text.
            key={`${item.id}:${item.caption ?? ""}`}
            className="website-builder-photo-caption mt-1 w-full rounded-md border border-[#dce4df] px-2 py-1.5 text-sm"
            maxLength={120}
            defaultValue={item.caption ?? ""}
            disabled={!canManage}
            onBlur={event => handleSetCaption(item.id, event.currentTarget.value)}
          />
        </label>
        {!item.isHero && (
          <label className="flex items-center gap-2 text-xs text-[#52655b]">
            <input
              type="checkbox"
              checked={Boolean(item.isGallerySelected)}
              disabled={!canManage}
              onChange={event => handleToggleGallery(item.id, event.currentTarget.checked)}
            />
            {t("websiteBuilder.showOnWebsite")}
          </label>
        )}
      </div>
    </div>
  );
}

export function PhotosSection({
  canManage,
  media,
  orderedPhotos,
  otherPhotos,
  hasCover,
  selectedGalleryIds,
  fileInputRef,
  focalMediaId,
  setFocalMediaId,
  handleUploadFiles,
  handleFocalPoint,
  handleSetHero,
  handleDeleteMedia,
  handleSetCaption,
  handleToggleGallery,
  handleReorderPhotos,
  photoError,
}: PhotosSectionProps) {
  const { t } = useTranslation();
  const orderedIds = orderedPhotos.map(photo => photo.id);
  const cardProps = { canManage, focalMediaId, setFocalMediaId, handleFocalPoint, handleSetHero, handleDeleteMedia, handleSetCaption, handleToggleGallery, orderCount: orderedPhotos.length, hasCover };
  function onMove(id: string, toIndex: number) {
    if (!canManage) return;
    const next = movePhotoToIndex(orderedIds, id, toIndex);
    if (next.join() !== orderedIds.join()) handleReorderPhotos(next);
  }

  return (
    <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
      <CardHeader className="border-b border-[#edf2ee] pb-4">
        <CardTitle className="flex items-center gap-2 text-lg text-[#263b31]">
          <ImageIcon size={18} aria-hidden="true" /> {t("websiteBuilder.mediaSectionTitle")}
        </CardTitle>
        <CardDescription>{t("websiteBuilder.mediaSectionDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {!canManage && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="note">
            {t("websiteBuilder.viewOnlyManageProfile")}
          </div>
        )}
        {photoError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            {photoError}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="hidden"
            onChange={e => {
              handleUploadFiles(e.target.files);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            aria-label={t("websiteBuilder.uploadMediaAria")}
          />
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canManage}
            className="bg-[#1d6b56] hover:bg-[#155442] disabled:opacity-50"
          >
            <Upload size={15} /> {t("websiteBuilder.uploadImage")}
          </Button>
          <span className="text-xs text-[#778a80]">{t("websiteBuilder.uploadHint")}</span>
        </div>
        <p className="field-help">{t("websiteBuilder.galleryCounter", { count: selectedGalleryIds.length })}</p>

        {media.length ? (
          <>
            {orderedPhotos.length > 0 && (
              <>
                {canManage && orderedPhotos.length > 1 && <p className="field-help">{t("websiteBuilder.reorderHint")}</p>}
                <div className="grid gap-3 sm:grid-cols-2" data-testid="website-photos">
                  {orderedPhotos.map((item, index) => <PhotoCard key={item.id} item={item} position={index + 1} onMove={onMove} {...cardProps} />)}
                </div>
              </>
            )}
            {otherPhotos.length > 0 && (
              <section className="space-y-2" aria-labelledby="wb-other-photos-title">
                <h3 id="wb-other-photos-title" className="text-sm font-semibold text-[#2a4035]">{t("websiteBuilder.otherPhotosTitle")}</h3>
                <p className="field-help">{t("websiteBuilder.otherPhotosHint")}</p>
                <div className="grid gap-3 sm:grid-cols-2" data-testid="other-photos">
                  {otherPhotos.map(item => (
                    <PhotoCard key={item.id} item={item} position={null} onMove={onMove} {...cardProps} />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="panel empty-state">
            <strong>{t("websiteBuilder.noMediaTitle")}</strong>
            <span>{t("websiteBuilder.noMediaDesc")}</span>
          </div>
        )}
        <p className="text-xs leading-5 text-[#778a80]">
          {t("websiteBuilder.mediaFooterHint")}
        </p>
      </CardContent>
    </Card>
  );
}
