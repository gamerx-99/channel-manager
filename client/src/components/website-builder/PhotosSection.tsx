import { useTranslation } from "@/lib/i18n";
import { Image as ImageIcon, Trash2, Upload, GripVertical } from "lucide-react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HotelMediaItem } from "@/components/website-builder/useWebsiteBuilder";
import { photoPosition, reorderPhotoIds } from "@/components/website-builder/photoReorder";
import type { CSSProperties, ReactNode, RefObject } from "react";

export type BuilderMediaItem = HotelMediaItem & { isGallerySelected?: boolean };

interface PhotosSectionProps {
  canManage: boolean;
  media: unknown[];
  /** Cover first, then the gallery in draft order. Only these can be dragged. */
  orderedPhotos: BuilderMediaItem[];
  /** Photos not on the website. Shown below, not draggable. */
  otherPhotos: BuilderMediaItem[];
  hasCover: boolean;
  selectedGalleryIds: string[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  focalMediaId: string | null;
  setFocalMediaId: (id: string | null) => void;
  handleUploadFiles: (files: FileList | null) => void;
  handleFocalPoint: (event: React.PointerEvent<HTMLImageElement>, item: BuilderMediaItem) => void;
  handleSetHero: (id: string) => void;
  handleDeleteMedia: (id: string) => void;
  handleSetCaption: (id: string, caption: string) => void;
  handleToggleGallery: (id: string, checked: boolean) => void;
  handleReorderPhotos: (ids: string[]) => void;
  onResetFocalPoint: (mediaId: string) => void;
  photoError?: string | null;
}

type PhotoCardProps = Pick<PhotosSectionProps, "canManage" | "focalMediaId" | "setFocalMediaId" | "handleFocalPoint" | "handleSetHero" | "handleDeleteMedia" | "handleSetCaption" | "handleToggleGallery" | "onResetFocalPoint"> & {
  item: BuilderMediaItem;
  /** 1-based place on the website, or null for a photo that is not shown. */
  position: number | null;
  dragHandle?: ReactNode;
};

function PhotoCard({ item, position, dragHandle, canManage, focalMediaId, setFocalMediaId, handleFocalPoint, handleSetHero, handleDeleteMedia, handleSetCaption, handleToggleGallery, onResetFocalPoint }: PhotoCardProps) {
  const { t } = useTranslation();
  const name = item.caption?.trim() || t("websiteBuilder.photoFallback", { order: item.displayOrder + 1 });
  const placeLabel = position === null ? t("websiteBuilder.notOnWebsiteLabel") : item.isHero ? t("websiteBuilder.heroImageLabel") : t("websiteBuilder.galleryLabel");
  return (
    <div className="group overflow-hidden rounded-xl border border-[#e6eee9] bg-white">
      <div className="relative aspect-[16/10] overflow-hidden bg-[#f6faf7]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={item.caption ?? "Hotel media preview"}
          className={`h-full w-full object-cover wb-object-position ${canManage ? "cursor-crosshair touch-manipulation" : ""}`}
          style={item.objectPosition ? { "--wb-object-position": item.objectPosition } as CSSProperties : undefined}
          onClick={() => setFocalMediaId(item.id)}
          onPointerDown={event => handleFocalPoint(event, item)}
        />
        {focalMediaId === item.id && (
          <span
            className="pointer-events-none absolute z-[2] h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-600 shadow wb-focal-marker"
            style={{
              "--wb-focal-x": item.objectPosition?.split(" ")[0] ?? "50%",
              "--wb-focal-y": item.objectPosition?.split(" ")[1] ?? "50%",
            } as CSSProperties}
          />
        )}
        {item.isHero && (
          <span className="absolute left-2 top-2 rounded-full bg-[#1d6b56] px-2 py-0.5 text-[11px] font-semibold text-white">
            {t("websiteBuilder.heroBadge")}
          </span>
        )}
      </div>
      {focalMediaId === item.id && (
        <div className="space-y-2 border-t border-[#e6eee9] p-3">
          <p className="text-xs font-medium">{t("websiteBuilder.chooseFocalPoint")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="aspect-[16/7] overflow-hidden rounded bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt=""
                className="h-full w-full object-cover wb-object-position"
                style={item.objectPosition ? { "--wb-object-position": item.objectPosition } as CSSProperties : undefined}
              />
            </div>
            <div className="aspect-[4/3] overflow-hidden rounded bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt=""
                className="h-full w-full object-cover wb-object-position"
                style={item.objectPosition ? { "--wb-object-position": item.objectPosition } as CSSProperties : undefined}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!canManage || !item.objectPosition} onClick={() => onResetFocalPoint(item.id)}>
              {t("websiteBuilder.resetFocalPoint")}
            </Button>
            <Button type="button" size="sm" onClick={() => setFocalMediaId(null)}>
              {t("websiteBuilder.focalDone")}
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-[#2a4035]">{placeLabel}</p>
          {position !== null && (
            <p className="text-[11px] text-[#778a80]">{t("websiteBuilder.displayOrderLabel", { order: position })}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`h-7 border-[#dce4df] px-2 text-xs ${item.isHero ? "bg-[#edf7f1] text-[#1d6b56]" : "bg-white"}`}
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
            className="h-7 w-7 text-[#8a9a93] hover:text-red-600"
            onClick={() => handleDeleteMedia(item.id)}
            disabled={!canManage || item.isHero}
            aria-label={t("websiteBuilder.deleteNamedMediaAria", { name })}
          >
            <Trash2 size={14} />
          </Button>
          {dragHandle}
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

function SortablePhotoCard(props: Omit<PhotoCardProps, "dragHandle"> & { position: number }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.item.id, disabled: !props.canManage });
  // Runtime values only, passed as CSS variables (house style); the look is in website-builder.css.
  const sortStyle = { "--wb-sort-transform": CSS.Transform.toString(transform) ?? "none", "--wb-sort-transition": transition ?? "none" } as CSSProperties;
  return (
    <div ref={setNodeRef} style={sortStyle} className={`wb-sortable ${isDragging ? "wb-sortable-dragging" : ""}`} data-photo-id={props.item.id}>
      <PhotoCard
        {...props}
        dragHandle={(
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="wb-drag-handle inline-flex h-7 w-7 items-center justify-center rounded-md text-[#8a9a93] hover:bg-[#f1f5f2] disabled:opacity-50"
            aria-label={t("websiteBuilder.dragHandleAria", { position: props.position })}
            disabled={!props.canManage}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
        )}
      />
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
  onResetFocalPoint,
  photoError,
}: PhotosSectionProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    // A small distance keeps taps on the handle from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const orderedIds = orderedPhotos.map(photo => photo.id);
  const cardProps = { canManage, focalMediaId, setFocalMediaId, handleFocalPoint, handleSetHero, handleDeleteMedia, handleSetCaption, handleToggleGallery, onResetFocalPoint };
  // Screen readers hear places on the website, never photo ids.
  const at = (id: string | number) => photoPosition(orderedIds, String(id));
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("websiteBuilder.reorderPickedUp", { position: at(active.id) }),
    // Silent while over its own place, so the pick-up message is not cut off right away.
    onDragOver: ({ active, over }) => over && over.id !== active.id ? t("websiteBuilder.reorderOver", { from: at(active.id), to: at(over.id) }) : undefined,
    onDragEnd: ({ active, over }) => {
      const from = at(active.id);
      const to = over ? at(over.id) : from;
      if (to === from) return t("websiteBuilder.reorderUnchanged", { position: from });
      if (hasCover && to === 1) return t("websiteBuilder.reorderCover", { position: from });
      return t("websiteBuilder.reorderMoved", { from, to });
    },
    onDragCancel: ({ active }) => t("websiteBuilder.reorderCancelled", { position: at(active.id) }),
  };
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const next = reorderPhotoIds(orderedIds, String(active.id), String(over.id));
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
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onDragEnd}
                  accessibility={{ announcements, screenReaderInstructions: { draggable: t("websiteBuilder.reorderInstructions") } }}
                >
                  <SortableContext items={orderedIds} strategy={rectSortingStrategy}>
                    <div className="grid gap-3 sm:grid-cols-2" data-testid="website-photos">
                      {orderedPhotos.map((item, index) => (
                        <SortablePhotoCard key={item.id} item={item} position={index + 1} {...cardProps} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </>
            )}
            {otherPhotos.length > 0 && (
              <section className="space-y-2" aria-labelledby="wb-other-photos-title">
                <h3 id="wb-other-photos-title" className="text-sm font-semibold text-[#2a4035]">{t("websiteBuilder.otherPhotosTitle")}</h3>
                <p className="field-help">{t("websiteBuilder.otherPhotosHint")}</p>
                <div className="grid gap-3 sm:grid-cols-2" data-testid="other-photos">
                  {otherPhotos.map(item => (
                    <PhotoCard key={item.id} item={item} position={null} {...cardProps} />
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
