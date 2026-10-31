import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { uploadHotelMediaFile } from "@/lib/hotelMedia";
import { Clock3, Eye, Globe, Image as ImageIcon, Palette, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageState } from "@/components/PageState";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { hasAnyPermission, type AppRole } from "@shared/authorization";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";

// Wire to tRPC hotel_site_config router (saveHotelSiteConfig / getHotelSiteConfig) and hotel_media write path
// (uploadHotelMedia / deleteHotelMedia / listHotelMedia / setHotelMediaHero).
// hotel_domains custom-domain flow is intentionally deferred (see DECISIONS.md) and not wired here.
//
// D1 returns camelCase (hotelId, heroCopy, accentColor, visibleSections, isHero, displayOrder...).
// Client form state mirrors that; only the tRPC *mutation inputs* stay snake_case (see handleSave).

type HotelMediaItem = inferRouterOutputs<AppRouter>["channelManager"]["listHotelMedia"][number];

type SiteConfig = {
  hotelId: string;
  heroCopy: string;
  accentColor: string;
  visibleSections: {
    hero: boolean;
    story: boolean;
    rooms: boolean;
    booking: boolean;
    location: boolean;
  };
};

const DEFAULT_VISIBLE_SECTIONS: SiteConfig["visibleSections"] = {
  hero: true,
  story: true,
  rooms: true,
  booking: true,
  location: true,
};

function defaultConfig(hotelId: string): SiteConfig {
  return {
    hotelId,
    heroCopy: "Explore room types, rates, and availability directly from this hotel.",
    accentColor: "#1d6b56",
    visibleSections: { ...DEFAULT_VISIBLE_SECTIONS },
  };
}

function isValidHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

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
  const { t } = useTranslation();
  const { data: hotels, isLoading, isError, refetch, isFetching } = trpc.channelManager.hotels.useQuery();
  const { data: authMe } = trpc.auth.me.useQuery();
  const authRoles = (authMe?.roles?.length ? authMe.roles : authMe?.role ? [authMe.role] : []) as AppRole[];
  const canManage = hasAnyPermission(authRoles, "property.manage_profile");
  const canView = hasAnyPermission(authRoles, "property.view");

  // The hotel page Photos tab links here with ?hotel=<id>.
  const [selectedHotelId, setSelectedHotelId] = useState<string>(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("hotel") ?? "");
  const effectiveHotelId = selectedHotelId || (hotels?.[0] as any)?.id || "";
  const selectedHotel = useMemo(() => (hotels ?? []).find((h: any) => h.id === effectiveHotelId) as any | undefined, [hotels, effectiveHotelId]);

  const { data: serverMedia = [], refetch: refetchMedia, isFetching: isFetchingMedia } = trpc.channelManager.listHotelMedia.useQuery(
    { hotel_id: effectiveHotelId },
    { enabled: !!effectiveHotelId }
  );

  const { data: serverConfig, refetch: refetchConfig, isFetching: isFetchingConfig } = trpc.channelManager.getHotelSiteConfigByHotelId.useQuery(
    { hotel_id: effectiveHotelId },
    { enabled: !!effectiveHotelId }
  );

  // Uploads go to the Worker's /api/media route; the tRPC procedure refuses them.
  const uploadMediaMut = useMutation({
    mutationFn: ({ hotel_id, ...file }: { hotel_id: string; base64: string; filename: string }) => uploadHotelMediaFile(hotel_id, file),
    onSuccess: () => { toast.success(t("websiteBuilder.toastImageUploaded")); refetchMedia(); },
    onError: (e: Error) => setFormError(e.message)
  });

  const deleteMediaMut = trpc.channelManager.deleteHotelMedia.useMutation({
    onSuccess: () => { toast.success(t("websiteBuilder.toastImageDeleted")); refetchMedia(); },
    onError: (e) => setFormError(e.message)
  });

  const setHeroMut = trpc.channelManager.setHotelMediaHero.useMutation({
    onSuccess: () => { toast.success(t("websiteBuilder.toastHeroUpdated")); refetchMedia(); },
    onError: (e) => setFormError(e.message)
  });

  const saveConfigMut = trpc.channelManager.saveHotelSiteConfig.useMutation({
    onSuccess: () => { toast.success(t("websiteBuilder.toastConfigSaved")); refetchConfig(); setSaveNote(t("websiteBuilder.savedViaNote")); },
    onError: (e) => setFormError(e.message)
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const media = serverMedia;
  const config = useMemo(() => (serverConfig ?? defaultConfig(effectiveHotelId)) as unknown as SiteConfig, [
    serverConfig,
    effectiveHotelId,
  ]);

  // Initialize draft form from config when hotel or config changes
  const [draft, setDraft] = useState<SiteConfig>(() => defaultConfig(effectiveHotelId));
  const [initializedFor, setInitializedFor] = useState<string>("");

  useEffect(() => {
    if (!effectiveHotelId) return;
    if (initializedFor !== effectiveHotelId) {
      setInitializedFor(effectiveHotelId);
      setDraft((serverConfig ?? defaultConfig(effectiveHotelId)) as unknown as SiteConfig);
      setFormError(null);
      setSaveNote(null);
    }
  }, [effectiveHotelId, serverConfig, initializedFor]);

  const heroImage = useMemo(() => media.find(m => m.isHero)?.url ?? media[0]?.url ?? null, [media]);

  const sectionLabels: Record<keyof SiteConfig["visibleSections"], { label: string; hint: string }> = useMemo(() => ({
    hero: { label: t("websiteBuilder.sectionHeroLabel"), hint: t("websiteBuilder.sectionHeroHint") },
    'story': { label: t("websiteBuilder.sectionStoryLabel"), hint: t("websiteBuilder.sectionStoryHint") },
    'rooms': { label: t("websiteBuilder.sectionRoomsLabel"), hint: t("websiteBuilder.sectionRoomsHint") },
    'booking': { label: t("websiteBuilder.sectionBookingLabel"), hint: t("websiteBuilder.sectionBookingHint") },
    'location': { label: t("websiteBuilder.sectionLocationLabel"), hint: t("websiteBuilder.sectionLocationHint") },
  }), [t]);

  function handleUploadFile(file: File) {
    setFormError(null);
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setFormError(t("websiteBuilder.errorFileTooLarge"));
      return;
    }
        const rawType = (file.type || "").split(";")[0].trim().toLowerCase();
    const normalizedType = rawType === "image/jpg" ? "image/jpeg" : rawType;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
    if (!allowedTypes.includes(normalizedType)) {
      setFormError(t("websiteBuilder.errorOnlyImages"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      if (!url) {
        setFormError(t("websiteBuilder.errorReadImage"));
        return;
      }
      const next = {
        hotel_id: effectiveHotelId,
        base64: url,
        filename: file.name,
      };
      uploadMediaMut.mutate(next);
      toast.success(t("websiteBuilder.toastUploadStarted"));
    };
    reader.onerror = () => setFormError(t("websiteBuilder.errorReadImage"));
    reader.readAsDataURL(file);
  }

  function handleDeleteMedia(id: string) {
    if (!canManage) {
      setFormError(t("websiteBuilder.errorNoPermissionDelete"));
      return;
    }
    deleteMediaMut.mutate({ hotel_id: effectiveHotelId, media_id: id });
  }

  function handleSetHero(id: string) {
    if (!canManage) return;
    setHeroMut.mutate({ hotel_id: effectiveHotelId, media_id: id });
  }

  function handleSave() {
    setFormError(null);
    setSaveNote(null);
    if (!canManage) {
      setFormError(t("websiteBuilder.errorNoPermissionSave"));
      return;
    }
    if (!effectiveHotelId) {
      setFormError(t("websiteBuilder.errorSelectHotelFirst"));
      return;
    }
    if (!isValidHexColor(draft.accentColor)) {
      setFormError(t("websiteBuilder.errorInvalidHex"));
      return;
    }
    if (draft.heroCopy.trim().length === 0) {
      setFormError(t("websiteBuilder.errorHeroCopyEmpty"));
      return;
    }
    if (draft.heroCopy.length > 500) {
      setFormError(t("websiteBuilder.errorHeroCopyTooLong"));
      return;
    }
    saveConfigMut.mutate({
      hotel_id: effectiveHotelId,
      hero_copy: draft.heroCopy,
      accent_color: draft.accentColor,
      visible_sections: draft.visibleSections,
    });
  }

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
    <div className="space-y-7 pb-8">
      <section className="flex flex-col gap-5 border-b border-[#dce4df] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">{t("websiteBuilder.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#1b2c25] sm:text-4xl">{t("websiteBuilder.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6c7e75]">
            {t("websiteBuilder.lede")}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#70837a]">
          <Clock3 size={14} aria-hidden="true" />
          <span>{t("websiteBuilder.perHotelConfig")}</span>
          {isFetching || isFetchingMedia || isFetchingConfig || uploadMediaMut.isPending || saveConfigMut.isPending || deleteMediaMut.isPending || setHeroMut.isPending ? <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#b7c9c0] border-t-[#1d6b56]" aria-label={t("websiteBuilder.updatingDataAriaLabel")} /> : null}
        </div>
      </section>

      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" aria-label={t("websiteBuilder.hotelSelectorAria")}>
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
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label={t("websiteBuilder.summaryAria")}>
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
              <span className="h-6 w-6 rounded-full border border-[#dce4df]" style={{ background: draft.accentColor }} aria-hidden="true" />
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
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-5">
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
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadFile(file);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  aria-label={t("websiteBuilder.uploadMediaAria")}
                />
                <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={!canManage} className="bg-[#1d6b56] hover:bg-[#155442] disabled:opacity-50">
                  <Upload size={15} /> {t("websiteBuilder.uploadImage")}
                </Button>
                <span className="text-xs text-[#778a80]">{t("websiteBuilder.uploadHint")}</span>
              </div>

              {media.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {media.map(item => (
                    <div key={item.id} className="group overflow-hidden rounded-xl border border-[#e6eee9] bg-white">
                      <div className="relative aspect-[16/10] overflow-hidden bg-[#f6faf7]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.url} alt={item.caption ?? "Hotel media preview"} className="h-full w-full object-cover" />
                        {item.isHero && (
                          <span className="absolute left-2 top-2 rounded-full bg-[#1d6b56] px-2 py-0.5 text-[11px] font-semibold text-white">{t("websiteBuilder.heroBadge")}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-[#2a4035]">{item.caption ?? item.id.slice(0, 8)}</p>
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
                            disabled={!canManage}
                            aria-label={t("websiteBuilder.deleteMediaAria", { id: item.id })}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <PageState tone="empty" title={t("websiteBuilder.noMediaTitle")} description={t("websiteBuilder.noMediaDesc")} />
              )}
              <p className="text-xs leading-5 text-[#778a80]">
                {t("websiteBuilder.mediaFooterHint")}
              </p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
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
                        className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold text-white"
                        style={{ background: draft.accentColor }}
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
                      <span className="mt-2 inline-flex rounded-md px-2.5 py-1 text-xs font-semibold text-white" style={{ background: draft.accentColor }}>
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
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
            <CardHeader className="border-b border-[#edf2ee] pb-4">
              <CardTitle className="flex items-center gap-2 text-lg text-[#263b31]">
                <Palette size={18} aria-hidden="true" /> {t("websiteBuilder.siteConfigTitle")}
              </CardTitle>
              <CardDescription>{t("websiteBuilder.siteConfigDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
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

              <Button type="button" onClick={handleSave} disabled={!canManage} className="w-full bg-[#1d6b56] hover:bg-[#155442] disabled:opacity-50">
                <Save size={15} /> {t("websiteBuilder.saveSiteConfig")}
              </Button>
              <p className="text-xs leading-5 text-[#778a80]">
                {t("websiteBuilder.saveConfigFooter")}
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
      </section>
    </div>
  );
}

