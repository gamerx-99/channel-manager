import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { Clock3, Eye, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageState } from "@/components/PageState";
import { dateLocale } from "@/lib/dateLocale";
import { type BuilderTab, type SiteConfig } from "@/components/website-builder/websiteBuilderRules";
import { BuilderTabs, panelId, tabId } from "@/components/website-builder/BuilderTabs";
import { useWebsiteBuilder } from "@/components/website-builder/useWebsiteBuilder";
import { ThemePickerSection } from "@/components/website-builder/ThemePickerSection";
import { PhotosSection } from "@/components/website-builder/PhotosSection";
import { PreviewSection } from "@/components/website-builder/PreviewSection";
import { ContentSection } from "@/components/website-builder/ContentSection";
import { DomainInfoCard } from "@/components/website-builder/DomainInfoCard";
import "@/components/website-builder/website-builder.css";

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
  const [activeTab, setActiveTab] = useState<BuilderTab>("theme");
  const {
    t, hotels, isLoading, isError, refetch, isFetching, canManage, canView,
    selectedHotelId, setSelectedHotelId, effectiveHotelId, selectedHotel, serverMedia,
    serverConfig, isFetchingMedia, isFetchingConfig, setPublished, uploadMediaMut,
    deleteMediaMut, setHeroMut, setObjectPositionMut, saveConfigMut, saveThemeMut,
    publishConfigMut, discardDraftMut, storedDraft, draft, setDraft, publishedConfig,
    config, previewAccentColor, focalMediaId, setFocalMediaId, fileInputRef, media,
    draftMedia, hasCover, orderedPhotos, otherPhotos, selectedGalleryIds, heroImage, selectedHotelHeroImage, previewHotelName, sectionLabels,
    formError, photoError, saveNote, handleUploadFiles, handleSetCaption, handleToggleGallery, handleDeleteMedia, handleSetHero, handleReorderPhotos,
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

  const pending = isFetching || isFetchingMedia || isFetchingConfig || uploadMediaMut.isPending || saveConfigMut.isPending || publishConfigMut.isPending || deleteMediaMut.isPending || setHeroMut.isPending;
  const discard = () => {
    if (window.confirm(t("websiteBuilder.confirmDiscardDraft"))) {
      discardDraftMut.mutate({ hotel_id: effectiveHotelId });
    }
  };
  const tabLabels: Record<BuilderTab, string> = {
    theme: t("websiteBuilder.tabTheme"),
    info: t("websiteBuilder.tabInfo"),
    photos: t("websiteBuilder.tabPhotos"),
    publish: t("websiteBuilder.tabPublish"),
  };
  const panel = (tab: BuilderTab) => ({ id: panelId(tab), role: "tabpanel" as const, "aria-labelledby": tabId(tab), hidden: activeTab !== tab, className: "wb-panel space-y-5" });

  return (
    <div className="page-content website-builder-page space-y-7 pb-8">
      <section className="page-intro intro-split">
        <div>
          <h1>{t("websiteBuilder.title")}</h1>
          <p className="lede">{t("websiteBuilder.lede")}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
          <Clock3 size={14} aria-hidden="true" />
          <span>{t("websiteBuilder.perHotelConfig")}</span>
          {pending ? (
            <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--rule-strong)] border-t-[var(--pine)]" aria-label={t("websiteBuilder.updatingDataAriaLabel")} />
          ) : null}
        </div>
      </section>

      <section className="panel wb-hotel-picker" aria-label={t("websiteBuilder.hotelSelectorAria")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <Globe size={16} aria-hidden="true" /> {t("websiteBuilder.hotelLabel")}
          </div>
          <div className="w-full sm:max-w-sm">
            <Select value={effectiveHotelId} onValueChange={setSelectedHotelId}>
              <SelectTrigger className="w-full border-[var(--rule)] bg-white">
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

      <BuilderTabs label={t("websiteBuilder.tabsAria")} labels={tabLabels} active={activeTab} onChange={setActiveTab} />

      <section aria-label={t("websiteBuilder.themePickerTitle")} {...panel("theme")}>
        <ThemePickerSection
          currentTheme={(config as SiteConfig).theme}
          canManage={canManage}
          isPending={saveThemeMut.isPending}
          previewHotelName={previewHotelName}
          selectedHotelHeroImage={selectedHotelHeroImage}
          heroObjectPosition={draftMedia.find(item => item.isHero)?.objectPosition}
          error={formError}
          onSelectTheme={handleSaveTheme}
        />
      </section>

      <section aria-label={t("websiteBuilder.siteConfigTitle")} {...panel("info")}>
        <ContentSection
          draft={draft}
          setDraft={setDraft}
          canManage={canManage}
          formError={formError}
          saveNote={saveNote}
          sectionLabels={sectionLabels}
        />
        <DomainInfoCard />
      </section>

      <section aria-label={t("websiteBuilder.mediaSectionTitle")} {...panel("photos")}>
        <PhotosSection
          canManage={canManage}
          media={media}
          orderedPhotos={orderedPhotos}
          otherPhotos={otherPhotos}
          hasCover={hasCover}
          selectedGalleryIds={selectedGalleryIds}
          fileInputRef={fileInputRef}
          focalMediaId={focalMediaId}
          setFocalMediaId={setFocalMediaId}
          handleUploadFiles={handleUploadFiles}
          handleFocalPoint={handleFocalPoint}
          handleSetHero={handleSetHero}
          handleDeleteMedia={handleDeleteMedia}
          handleSetCaption={handleSetCaption}
          handleToggleGallery={handleToggleGallery}
          handleReorderPhotos={handleReorderPhotos}
          photoError={photoError}
        />
      </section>

      <section aria-label={t("websiteBuilder.tabPublish")} {...panel("publish")}>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("websiteBuilder.publishStatusTitle")}</h2>
            </div>
          </div>
          <div className="wb-status-list">
            <div className="wb-status-row">
              <div>
                <p className="wb-status-label">{t("websiteBuilder.statusPageLabel")}</p>
                <span className={`status-pill ${selectedHotel?.public_enabled ? "live" : "pending"}`}>
                  {selectedHotel?.public_enabled ? t("websiteBuilder.pageOpen") : t("websiteBuilder.pagePrivate")}
                </span>
                {!selectedHotel?.public_enabled && <p className="field-help">{t("websiteBuilder.privatePageNote")}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!selectedHotel?.public_enabled && canManage && (
                  <Button
                    type="button"
                    onClick={() => setPublished.mutate({ hotel_id: effectiveHotelId, public_enabled: true })}
                    disabled={setPublished.isPending}
                  >
                    <Globe size={15} /> {setPublished.isPending ? t("hotelDetail.publishSaving") : t("websiteBuilder.publishPage")}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={!selectedHotel?.slug}
                  onClick={() => selectedHotel?.slug && window.open(`/${selectedHotel.slug}`, "_blank", "noopener,noreferrer")}
                >
                  <Eye size={15} /> {t("websiteBuilder.viewHotelPage")}
                </Button>
              </div>
            </div>
            <div className="wb-status-row">
              <div>
                <p className="wb-status-label">{t("websiteBuilder.statusDraftLabel")}</p>
                <span className={`status-pill ${storedDraft ? "pending" : "live"}`}>
                  {storedDraft
                    ? t("websiteBuilder.unpublishedStatus")
                    : serverConfig?.publishedAt
                    ? t("websiteBuilder.publishedDate", { date: new Date(serverConfig.publishedAt).toLocaleDateString(dateLocale(language)) })
                    : serverConfig && (serverConfig.heroCopy || serverConfig.theme || serverConfig.visibleSections)
                    ? t("websiteBuilder.published")
                    : t("websiteBuilder.notPublishedYet")}
                </span>
                <p className="field-help">{t("websiteBuilder.publishNote")}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2" aria-label={t("websiteBuilder.summaryAria")}>
          <Card className="border-[var(--rule)]">
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--ink-muted)]">{t("websiteBuilder.summaryMediaItems")}</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--ink)]">{media.length}</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("websiteBuilder.summaryMediaHint")}</p>
            </CardContent>
          </Card>
          <Card className="border-[var(--rule)]">
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--ink-muted)]">{t("websiteBuilder.summaryVisibleSections")}</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--ink)]">{Object.values(draft.visibleSections).filter(Boolean).length} / 5</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("websiteBuilder.summaryVisibleHint")}</p>
            </CardContent>
          </Card>
        </div>

        <PreviewSection
          config={config}
          draft={draft}
          canManage={canManage}
          hotelName={selectedHotel?.name}
          hotelAddress={selectedHotel?.address}
          roomTypesCount={selectedHotel?.room_types?.length ?? 0}
          heroImage={heroImage}
          heroObjectPosition={(draftMedia.find(item => item.isHero) ?? draftMedia[0])?.objectPosition}
          previewAccentColor={previewAccentColor}
        />
      </section>

      {canManage && (
        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--rule)] bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <Button type="button" variant="outline" disabled={discardDraftMut.isPending || !storedDraft} onClick={discard}>
            {t("websiteBuilder.discardDraft")}
          </Button>
          <Button type="button" variant="outline" disabled={saveConfigMut.isPending} onClick={handleSave}>
            {saveConfigMut.isPending ? t("websiteBuilder.savingDraft") : t("websiteBuilder.saveDraft")}
          </Button>
          <Button type="button" disabled={publishConfigMut.isPending} onClick={() => publishConfigMut.mutate({ hotel_id: effectiveHotelId })}>
            {publishConfigMut.isPending ? t("websiteBuilder.publishing") : t("websiteBuilder.publishChanges")}
          </Button>
        </div>
      )}
    </div>
  );
}
