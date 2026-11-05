import { useTranslation } from "@/lib/i18n";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HotelMediaItem } from "@/components/website-builder/useWebsiteBuilder";
import type { CSSProperties, RefObject } from "react";

export type BuilderMediaItem = HotelMediaItem & { isGallerySelected?: boolean };

interface PhotosSectionProps {
  canManage: boolean;
  media: unknown[];
  draftMedia: BuilderMediaItem[];
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
  onResetFocalPoint: (mediaId: string) => void;
  photoError?: string | null;
}

export function PhotosSection({
  canManage,
  media,
  draftMedia,
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
  onResetFocalPoint,
  photoError,
}: PhotosSectionProps) {
  const { t } = useTranslation();

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
          <div className="grid gap-3 sm:grid-cols-2">
            {draftMedia.map(item => (
              <div key={item.id} className="group overflow-hidden rounded-xl border border-[#e6eee9] bg-white">
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
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canManage || !item.objectPosition}
                        onClick={() => onResetFocalPoint(item.id)}
                      >
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
                    <p className="truncate text-xs font-medium text-[#2a4035]">
                      {item.isHero ? t("websiteBuilder.heroImageLabel") : t("websiteBuilder.galleryLabel")}
                    </p>
                    <p className="text-[11px] text-[#778a80]">
                      {item.isHero ? t("websiteBuilder.heroImageLabel") : t("websiteBuilder.galleryLabel")} · {t("websiteBuilder.displayOrderLabel", { order: item.displayOrder })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`h-7 border-[#dce4df] px-2 text-xs ${item.isHero ? "bg-[#edf7f1] text-[#1d6b56]" : "bg-white"}`}
                      onClick={() => handleSetHero(item.id)}
                      disabled={!canManage || item.isHero}
                      aria-label={t("websiteBuilder.setHeroAria", { id: item.id })}
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
                      aria-label={t("websiteBuilder.deleteMediaAria", { id: item.id })}
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
                        checked={item.isGallerySelected}
                        disabled={!canManage}
                        onChange={event => handleToggleGallery(item.id, event.currentTarget.checked)}
                      />
                      {t("websiteBuilder.showOnWebsite")}
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
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
