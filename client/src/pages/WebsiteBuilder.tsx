import { useTranslation } from "@/lib/i18n";
import { Clock3, Eye, Globe, Image as ImageIcon, Palette, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageState } from "@/components/PageState";
import { dateLocale } from "@/lib/dateLocale";
import { HOTEL_THEMES } from "@shared/hotelThemes";
import { getContrastText } from "@/lib/contrastText";
import TemplateCardPreview from "@/components/hotel-themes/TemplateCardPreview";
import { defaultConfig, isValidHexColor, type SiteConfig } from "@/components/website-builder/websiteBuilderRules";
import { useWebsiteBuilder } from "@/components/website-builder/useWebsiteBuilder";
import "@/components/website-builder/website-builder.css";

import type { CSSProperties } from "react";

function LoadingWebsiteBuilder() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label={t("websiteBuilder.loadingAriaLabel")}>
      <div className="flex items-center gap-3 rounded-xl border border-[#dce4df] bg-[#f6faf7] px-4 py-3 text-sm text-[#456156]">
        <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-[#9bbcae] border-t-[#1d6b56]" aria-hidden="true" />
        <span>{t("websiteBuilder.loadingBuilder")}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-[#e5ebe7] bg-white" />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-2xl border border-[#e5ebe7] bg-white" />
    </div>
  );
}

export default function WebsiteBuilder() {
  const { language } = useTranslation();
  const {
    t, hotels, isLoading, isError, refetch, isFetching, canManage, canView,
    selectedHotelId, setSelectedHotelId, effectiveHotelId, selectedHotel, serverMedia,
    serverConfig, isFetchingMedia, isFetchingConfig, setPublished, uploadMediaMut,
    deleteMediaMut, setHeroMut, setObjectPositionMut, saveConfigMut, saveThemeMut,
    publishConfigMut, discardDraftMut, storedDraft, draft, setDraft, publishedConfig,
    config, previewAccentColor, focalMediaId, setFocalMediaId, fileInputRef, media,
    draftMedia, selectedGalleryIds, heroImage, selectedHotelHeroImage, previewHotelName, sectionLabels,
    formError, saveNote, handleUploadFiles, handleSetCaption, handleToggleGallery, handleDeleteMedia, handleSetHero,
    handleFocalPoint, handleSave, handleSaveTheme,
  } = useWebsiteBuilder();

  if (isLoading) return <LoadingWebsiteBuilder />;

  if (isError || !hotels) {
    return (
      <PageState
        tone="error"
        title={t("websiteBuilder.unableToLoadTitle")}
        description={t("websiteBuilder.unableToLoadDesc")}
        actionLabel={t("websiteBuilder.tryAgain")}
        onAction={() => void refetch()}
      />
    );
  }

  if (!canView) {
    return (
      <PageState
        tone="error"
        title={t("websiteBuilder.accessRestrictedTitle")}
        description={t("websiteBuilder.accessRestrictedDesc")}
      />
    );
  }

  if (!hotels.length) {
    return (
      <PageState
        tone="empty"
        title={t("websiteBuilder.noHotelsTitle")}
        description={t("websiteBuilder.noHotelsDesc")}
      />
    );
  }

  return (
    <div className="page-content space-y-7 pb-8">
      <section className="page-intro intro-split">
        <div>
          <div className="eyebrow">{t("websiteBuilder.eyebrow")}</div>
          <h1>{t("websiteBuilder.title")}<span className="title-mark">.</span></h1>
          <p className="lede">
            {t("websiteBuilder.lede")}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#70837a]">
          <Clock3 size={14} aria-hidden="true" />
          <span>{t("websiteBuilder.perHotelConfig")}</span>
          {isFetching || isFetchingMedia || isFetchingConfig || uploadMediaMut.isPending || saveConfigMut.isPending || publishConfigMut.isPending || deleteMediaMut.isPending || setHeroMut.isPending ? <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#b7c9c0] border-t-[#1d6b56]" aria-label={t("websiteBuilder.updatingDataAriaLabel")} /> : null}
        </div>
      </section>

      <section className="panel">
      <div className="panel-heading"><div><div className="eyebrow">{t("websiteBuilder.eyebrow")}</div><h2>{t("websiteBuilder.viewHotelPage")}</h2></div><span className={`status-pill ${storedDraft ? "pending" : "live"}`}>{storedDraft ? t("websiteBuilder.unpublishedStatus") : serverConfig?.publishedAt ? t("websiteBuilder.publishedDate", { date: new Date(serverConfig.publishedAt).toLocaleDateString(dateLocale(language)) }) : serverConfig && (serverConfig.heroCopy || serverConfig.theme || serverConfig.accentColor || serverConfig.visibleSections) ? t("websiteBuilder.published") : t("websiteBuilder.notPublishedYet")}</span></div>
      {storedDraft && <p className="field-help">{t("websiteBuilder.publishNote")}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={!selectedHotel?.slug} onClick={() => selectedHotel?.slug && window.open(`/${selectedHotel.slug}`, "_blank", "noopener,noreferrer")}>
          <Eye size={15} /> {t("websiteBuilder.viewHotelPage")}
        </Button>
        {!selectedHotel?.public_enabled && <>
          <p className="m-0 text-sm text-[#6c7e75]">{t("websiteBuilder.privatePageNote")}</p>
          {canManage && <Button type="button" onClick={() => setPublished.mutate({ hotel_id: effectiveHotelId, public_enabled: true })} disabled={setPublished.isPending}>
            <Globe size={15} /> {setPublished.isPending ? t("hotelDetail.publishSaving") : t("websiteBuilder.publishPage")}
          </Button>}
        </>}
      </div>
      </section>

      <section className="panel" aria-label={t("websiteBuilder.hotelSelectorAria")}>
        <div className="panel-heading"><div><div className="eyebrow">{t("websiteBuilder.eyebrow")}</div><h2>{t("websiteBuilder.hotelLabel")}</h2></div></div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#263b31]">
          <Globe size={16} aria-hidden="true" /> {t("websiteBuilder.hotelLabel")}
        </div>
        <div className="w-full sm:max-w-sm">
          <Select value={effectiveHotelId} onValueChange={setSelectedHotelId}>
            <SelectTrigger className="border-[#dce4df] bg-white">
              <SelectValue placeholder={t("websiteBuilder.selectHotelPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {(hotels as any[]).map(h => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name} · {h.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        </div>
      </section>

      <section className="panel" aria-label={t("websiteBuilder.summaryAria")}>
        <div className="panel-heading"><div><div className="eyebrow">{t("websiteBuilder.eyebrow")}</div><h2>{t("websiteBuilder.summaryVisibleSections")}</h2></div></div>
        <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">{t("websiteBuilder.summaryMediaItems")}</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#263b31]">{media.length}</p>
            <p className="mt-1 text-xs text-[#778a80]">{t("websiteBuilder.summaryMediaHint")}</p>
          </CardContent>
        </Card>
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">{t("websiteBuilder.summaryAccentColor")}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="h-6 w-6 rounded-full border border-[#dce4df] wb-accent-swatch" style={{ "--wb-accent": draft.accentColor } as CSSProperties} aria-hidden="true" />
              <span className="text-sm font-mono font-semibold text-[#263b31]">{draft.accentColor}</span>
            </div>
            <p className="mt-1 text-xs text-[#778a80]">{t("websiteBuilder.summaryAccentHint")}</p>
          </CardContent>
        </Card>
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">{t("websiteBuilder.summaryVisibleSections")}</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#263b31]">{Object.values(draft.visibleSections).filter(Boolean).length} / 5</p>
            <p className="mt-1 text-xs text-[#778a80]">{t("websiteBuilder.summaryVisibleHint")}</p>
          </CardContent>
        </Card>
        </div>
      </section>

      <section className="panel" aria-label={t("websiteBuilder.summaryAria")}>
        <div className="panel-heading"><div><div className="eyebrow">{t("websiteBuilder.eyebrow")}</div><h2>{t("websiteBuilder.themePickerTitle")}</h2></div></div>
        <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-5">
          <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
            <CardHeader className="border-b border-[#edf2ee] pb-4">
              <CardTitle className="text-lg text-[#263b31]">{t("websiteBuilder.themePickerTitle")}</CardTitle>
              <CardDescription>{t("websiteBuilder.themePickerDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label={t("websiteBuilder.themePickerTitle")}>
                {HOTEL_THEMES.map(theme => {
                  const selected = (config as SiteConfig).theme === theme.id;
                  return <button key={theme.id} type="button" onClick={() => handleSaveTheme(theme.id)} disabled={!canManage || saveThemeMut.isPending}
                    aria-pressed={selected} data-theme-id={theme.id}
                    className={`min-w-0 overflow-hidden rounded-xl border text-left transition ${selected ? "border-[#1d6b56] ring-2 ring-[#1d6b56]/20" : "border-[#e6eee9] hover:border-[#91b3a5]"}`}>
                  <TemplateCardPreview theme={theme.id} hotelName={previewHotelName} photo={selectedHotelHeroImage} objectPosition={draftMedia.find(item => item.isHero)?.objectPosition} />
                    <div className="space-y-1 p-3">
                      <div className="flex items-center justify-between gap-2"><span className="font-semibold text-[#263b31]">{theme.name}</span>
                        {theme.tier === "premium" ? <span className="shrink-0 rounded-full bg-[#f5eadf] px-2 py-0.5 text-[10px] font-semibold text-[#795548]">Pro</span> : null}</div>
                      <p className="text-xs leading-5 text-[#6c7e75]">{theme.description}</p>
                      {selected ? <span className="text-xs font-semibold text-[#1d6b56]">{t("websiteBuilder.currentTheme")}</span> : null}
                    </div>
                  </button>;
                })}
              </div>
            </CardContent>
          </Card>

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
                <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={!canManage} className="bg-[#1d6b56] hover:bg-[#155442] disabled:opacity-50">
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
                        <img src={item.url} alt={item.caption ?? "Hotel media preview"} className={`h-full w-full object-cover wb-object-position ${canManage ? "cursor-crosshair touch-manipulation" : ""}`} style={item.objectPosition ? { "--wb-object-position": item.objectPosition } as CSSProperties : undefined} onClick={() => setFocalMediaId(item.id)} onPointerDown={event => handleFocalPoint(event, item)} />
                        {focalMediaId === item.id && <span className="pointer-events-none absolute z-[2] h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-600 shadow wb-focal-marker" style={{ "--wb-focal-x": item.objectPosition?.split(" ")[0] ?? "50%", "--wb-focal-y": item.objectPosition?.split(" ")[1] ?? "50%" } as CSSProperties} />}
                        {item.isHero && (
                          <span className="absolute left-2 top-2 rounded-full bg-[#1d6b56] px-2 py-0.5 text-[11px] font-semibold text-white">{t("websiteBuilder.heroBadge")}</span>
                        )}
                      </div>
                      {focalMediaId === item.id && <div className="space-y-2 border-t border-[#e6eee9] p-3">
                        <p className="text-xs font-medium">{t("websiteBuilder.chooseFocalPoint")}</p>
                        <div className="grid grid-cols-2 gap-2"><div className="aspect-[16/7] overflow-hidden rounded bg-slate-100"><img src={item.url} alt="" className="h-full w-full object-cover wb-object-position" style={item.objectPosition ? { "--wb-object-position": item.objectPosition } as CSSProperties : undefined} /></div><div className="aspect-[4/3] overflow-hidden rounded bg-slate-100"><img src={item.url} alt="" className="h-full w-full object-cover wb-object-position" style={item.objectPosition ? { "--wb-object-position": item.objectPosition } as CSSProperties : undefined} /></div></div>
                        <Button type="button" variant="outline" size="sm" disabled={!canManage || !item.objectPosition} onClick={() => setObjectPositionMut.mutate({ hotel_id: effectiveHotelId, media_id: item.id, object_position: null })}>{t("websiteBuilder.resetFocalPoint")}</Button>
                      </div>}
                      <div className="flex items-center justify-between gap-2 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-[#2a4035]">{item.isHero ? t("websiteBuilder.heroImageLabel") : t("websiteBuilder.galleryLabel")}</p>
                          <p className="text-[11px] text-[#778a80]">{item.isHero ? t("websiteBuilder.heroImageLabel") : t("websiteBuilder.galleryLabel")} · {t("websiteBuilder.displayOrderLabel", { order: item.displayOrder })}</p>
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
                        <label className="block text-xs font-medium text-[#52655b]">{t("websiteBuilder.photoCaptionLabel")}
                          <input className="website-builder-photo-caption mt-1 w-full rounded-md border border-[#dce4df] px-2 py-1.5 text-sm" maxLength={120} defaultValue={item.caption ?? ""} disabled={!canManage} onBlur={event => handleSetCaption(item.id, event.currentTarget.value)} />
                        </label>
                        {!item.isHero && <label className="flex items-center gap-2 text-xs text-[#52655b]">
                          <input type="checkbox" checked={item.isGallerySelected} disabled={!canManage} onChange={event => handleToggleGallery(item.id, event.currentTarget.checked)} />
                          {t("websiteBuilder.showOnWebsite")}
                        </label>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="panel empty-state"><strong>{t("websiteBuilder.noMediaTitle")}</strong><span>{t("websiteBuilder.noMediaDesc")}</span></div>
              )}
              <p className="text-xs leading-5 text-[#778a80]">
                {t("websiteBuilder.mediaFooterHint")}
              </p>
            </CardContent>
          </Card>

          {/* ASSUMPTION: the draft preview stays inside the protected builder and is never a public route. */}
          {canManage && <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
            <CardHeader className="border-b border-[#edf2ee] pb-4">
              <CardTitle className="flex items-center gap-2 text-lg text-[#263b31]">
                <Eye size={18} aria-hidden="true" /> {t("websiteBuilder.publicPreviewTitle")}
              </CardTitle>
              <CardDescription>{t("websiteBuilder.publicPreviewDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="overflow-hidden rounded-xl border border-[#e6eee9] bg-white">
                {config?.visibleSections?.hero ? (
                  <div className="relative h-[220px] overflow-hidden bg-[#f6faf7]">
                    {heroImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={heroImage} alt={`Preview for ${selectedHotel?.name ?? "hotel"}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-[#7a8c83]">{t("websiteBuilder.noHeroImagePreview")}</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" aria-hidden="true" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-lg font-semibold text-white">{selectedHotel?.name ?? "Your hotel preview"}</h3>
                      <p className="mt-1 max-w-xl text-sm leading-6 text-white/90">{draft.heroCopy || config.heroCopy}</p>
                      <span
                        className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold wb-preview-accent"
                        style={{ "--wb-accent": previewAccentColor, "--wb-accent-contrast": getContrastText(previewAccentColor) } as CSSProperties}
                      >
                        {t("websiteBuilder.viewRooms")}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3 text-xs text-[#7a8c83]">{t("websiteBuilder.heroSectionHidden")}</div>
                )}

                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  {config?.visibleSections?.story ? (
                    <div className="rounded-lg border border-[#e6eee9] bg-[#fbfdfb] p-3">
                      <p className="text-xs font-semibold text-[#263b31]">{t("websiteBuilder.theHotel")}</p>
                      <p className="mt-1 text-xs leading-5 text-[#6c7e75]">{t("websiteBuilder.stayAt", { hotelName: selectedHotel?.name ?? "this hotel" })}</p>
                    </div>
                  ) : null}
                  {config?.visibleSections?.rooms ? (
                    <div className="rounded-lg border border-[#e6eee9] bg-[#fbfdfb] p-3">
                      <p className="text-xs font-semibold text-[#263b31]">{t("websiteBuilder.rooms")}</p>
                      <p className="mt-1 text-xs leading-5 text-[#6c7e75]">{t("websiteBuilder.roomsPreviewHint", { count: selectedHotel?.room_types?.length ?? 0 })}</p>
                    </div>
                  ) : null}
                  {config?.visibleSections?.booking ? (
                    <div className="rounded-lg border border-[#e6eee9] bg-[#fbfdfb] p-3">
                      <p className="text-xs font-semibold text-[#263b31]">{t("websiteBuilder.yourStay")}</p>
                      <p className="mt-1 text-xs leading-5 text-[#6c7e75]">{t("websiteBuilder.bookingCardPreviewHint")}</p>
                      <span className="mt-2 inline-flex rounded-md px-2.5 py-1 text-xs font-semibold wb-preview-accent" style={{ "--wb-accent": previewAccentColor, "--wb-accent-contrast": getContrastText(previewAccentColor) } as CSSProperties}>
                        {t("websiteBuilder.planVisit")}
                      </span>
                    </div>
                  ) : null}
                  {config?.visibleSections?.location ? (
                    <div className="rounded-lg border border-[#e6eee9] bg-[#fbfdfb] p-3">
                      <p className="text-xs font-semibold text-[#263b31]">{t("websiteBuilder.location")}</p>
                      <p className="mt-1 text-xs leading-5 text-[#6c7e75]">{selectedHotel?.address ?? t("websiteBuilder.addressFallback")}</p>
                    </div>
                  ) : null}
                  {!Object.values(draft.visibleSections).some(Boolean) && (
                    <div className="col-span-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("websiteBuilder.allSectionsHidden")}</div>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#667a70]">
                {t("websiteBuilder.publicHotelFallbackNote")}
              </p>
            </CardContent>
          </Card>}
        </div>

        <div className="space-y-5">
          <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
            <CardHeader className="border-b border-[#edf2ee] pb-4">
              <CardTitle className="flex items-center gap-2 text-lg text-[#263b31]">
                <Palette size={18} aria-hidden="true" /> {t("websiteBuilder.siteConfigTitle")}
              </CardTitle>
              <CardDescription>{t("websiteBuilder.siteConfigDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="form-grid pt-5">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                  {formError}
                </div>
              )}
              {saveNote && (
                <div className="rounded-lg border border-[#cfe3d8] bg-[#edf7f1] px-3 py-2 text-xs text-[#1d6b56]" role="status">
                  {saveNote}
                </div>
              )}
              {!canManage && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("websiteBuilder.requiresManageProfile")}</div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="wb-hero-copy" className="text-xs text-[#52655b]">
                  {t("websiteBuilder.heroCopyLabel")}
                </Label>
                <Textarea
                  id="wb-hero-copy"
                  value={draft.heroCopy}
                  onChange={e => setDraft(p => ({ ...p, heroCopy: e.target.value }))}
                  disabled={!canManage}
                  className="min-h-[96px] border-[#dce4df]"
                  placeholder={t("websiteBuilder.heroCopyPlaceholder")}
                  maxLength={500}
                  aria-label="hero_copy"
                />
                <p className="text-[11px] text-[#778a80]">{draft.heroCopy.length} / 500</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wb-accent-color" className="text-xs text-[#52655b]">
                  {t("websiteBuilder.accentColorLabel")}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="wb-accent-color"
                    type="color"
                    value={isValidHexColor(draft.accentColor) ? draft.accentColor : "#1d6b56"}
                    onChange={e => setDraft(p => ({ ...p, accentColor: e.target.value }))}
                    disabled={!canManage}
                    className="h-9 w-14 border-[#dce4df] p-1"
                    aria-label="accent_color picker"
                  />
                  <Input
                    placeholder="#1d6b56"
                    value={draft.accentColor}
                    onChange={e => setDraft(p => ({ ...p, accentColor: e.target.value }))}
                    disabled={!canManage}
                    className="flex-1 border-[#dce4df] font-mono text-sm"
                    aria-label="accent_color"
                  />
                </div>
                <p className="text-[11px] text-[#778a80]">{t("websiteBuilder.accentColorHint")}</p>
              </div>

              <div className="space-y-3">
                <Label className="text-xs text-[#52655b]">{t("websiteBuilder.visibleSectionsLabel")}</Label>
                <div className="space-y-2 rounded-xl border border-[#e6eee9] bg-[#fbfdfb] p-3">
                  {(Object.keys(sectionLabels) as Array<keyof SiteConfig["visibleSections"]>).map(key => (
                    <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-[#e5ebe7] bg-white px-3 py-2.5">
                      <span>
                        <span className="text-sm font-medium text-[#263b31]">{sectionLabels[key].label}</span>
                        <span className="ml-2 text-xs text-[#7a8c83]">{sectionLabels[key].hint}</span>
                      </span>
                      <Switch
                        checked={draft.visibleSections[key]}
                        onCheckedChange={v => setDraft(p => ({ ...p, visibleSections: { ...p.visibleSections, [key]: v } }))}
                        disabled={!canManage}
                        aria-label={`visible_sections ${key}`}
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-[#778a80]">{t("websiteBuilder.visibleSectionsHint")}</p>
              </div>

              <Button type="button" onClick={handleSave} disabled={!canManage || saveConfigMut.isPending} className="form-submit button button-primary w-full">
                <Save size={15} /> {t("websiteBuilder.saveDraft")}
              </Button>
              <Button type="button" onClick={() => publishConfigMut.mutate({ hotel_id: effectiveHotelId })} disabled={!canManage || !storedDraft || publishConfigMut.isPending} className="button button-primary w-full">{t("websiteBuilder.publishChanges")}</Button>
              {/* ASSUMPTION: explicit confirmation is sufficient protection for discarding the saved draft. */}
              {storedDraft && <Button type="button" variant="outline" disabled={!canManage || discardDraftMut.isPending} onClick={() => { if (window.confirm(t("websiteBuilder.confirmDiscardDraft"))) discardDraftMut.mutate({ hotel_id: effectiveHotelId }); }} className="w-full">{t("websiteBuilder.discardDraft")}</Button>}
              <p className="text-xs leading-5 text-[#778a80]">
                {t("websiteBuilder.publishNote")}
              </p>
            </CardContent>
          </Card>

          <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
            <CardHeader className="border-b border-[#edf2ee] pb-4">
              <CardTitle className="text-sm text-[#263b31]">{t("websiteBuilder.aboutDomainsTitle")}</CardTitle>
              <CardDescription>{t("websiteBuilder.aboutDomainsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-xs leading-5 text-[#6c7e75]">
                {t("websiteBuilder.aboutDomainsBody")}
              </p>
            </CardContent>
          </Card>
        </div>
        </div>
      </section>
    </div>
  );
}

