import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { hasAnyPermission, hasHotelPermission, type AppRole } from "@shared/authorization";
import { HOTEL_THEMES, MAX_WEBSITE_GALLERY_PHOTOS, type HotelThemeId } from "@shared/hotelThemes";
import { uploadHotelMediaFile } from "@/lib/hotelMedia";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";
import { defaultConfig, isValidHexColor, type SiteConfig } from "./websiteBuilderRules";
import { displayPhotoCaption } from "@shared/websitePhotos";

export type HotelMediaItem = inferRouterOutputs<AppRouter>["channelManager"]["listHotelMedia"][number];

// Wire to tRPC hotel_site_config router (saveHotelSiteConfig / getHotelSiteConfig) and hotel_media write path.
// (uploadHotelMedia / deleteHotelMedia / listHotelMedia / setHotelMediaHero).
// hotel_domains custom-domain flow is intentionally deferred (see DECISIONS.md) and not wired here.

export function useWebsiteBuilder() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const setPublished = trpc.channelManager.setHotelPublished.useMutation({ onSuccess: async () => { await utils.channelManager.hotels.invalidate(); } });
  const { data: hotels, isLoading, isError, refetch, isFetching } = trpc.channelManager.hotels.useQuery();
  const { data: authMe } = trpc.auth.me.useQuery();
  const authRoles = (authMe?.roles?.length ? authMe.roles : authMe?.role ? [authMe.role] : []) as AppRole[];
  const memberships = authMe?.memberships ?? [];
  const [selectedHotelId, setSelectedHotelId] = useState<string>(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("hotel") ?? "");
  const effectiveHotelId = selectedHotelId || (hotels?.[0] as any)?.id || "";
  const selectedHotel = useMemo(() => (hotels ?? []).find((h: any) => h.id === effectiveHotelId) as any | undefined, [hotels, effectiveHotelId]);
  // Hotel-level permissions come from memberships, not only platform roles.
  const canManage = Boolean(effectiveHotelId && hasHotelPermission(authRoles, memberships, effectiveHotelId, "property.manage_profile"));
  const canView = (hotels ?? []).some((h: any) => hasHotelPermission(authRoles, memberships, h.id, "property.view"));
  const { data: serverMedia = [], refetch: refetchMedia, isFetching: isFetchingMedia } = trpc.channelManager.listHotelMedia.useQuery({ hotel_id: effectiveHotelId }, { enabled: !!effectiveHotelId });
  const { data: serverConfig, refetch: refetchConfig, isFetching: isFetchingConfig } = trpc.channelManager.getHotelSiteConfigByHotelId.useQuery({ hotel_id: effectiveHotelId }, { enabled: !!effectiveHotelId });
  const [formError, setFormError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [focalMediaId, setFocalMediaId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadMediaMut = useMutation({
    mutationFn: ({ hotel_id, ...file }: { hotel_id: string; base64: string; filename: string }) => uploadHotelMediaFile(hotel_id, file),
    onSuccess: () => { toast.success(t("websiteBuilder.toastImageUploaded")); refetchMedia(); },
    onError: (e: Error) => setFormError(e.message),
  });
  const deleteMediaMut = trpc.channelManager.deleteHotelMedia.useMutation({ onSuccess: () => { toast.success(t("websiteBuilder.toastImageDeleted")); refetchMedia(); }, onError: e => setFormError(e.message) });
  const setHeroMut = trpc.channelManager.setHotelMediaHero.useMutation({ onSuccess: () => { toast.success(t("websiteBuilder.toastHeroUpdated")); refetchMedia(); }, onError: e => setFormError(e.message) });
  const setObjectPositionMut = trpc.channelManager.setHotelMediaObjectPosition.useMutation({ onSuccess: () => refetchMedia(), onError: e => setFormError(e.message) });
  const setCaptionMut = trpc.channelManager.setHotelMediaCaption.useMutation({ onSuccess: () => refetchConfig(), onError: e => setFormError(e.message) });
  const setGalleryMut = trpc.channelManager.setHotelMediaGallerySelection.useMutation({ onSuccess: () => refetchConfig(), onError: e => setFormError(e.message.includes("six gallery") ? t("websiteBuilder.galleryLimitReached") : e.message) });
  const saveConfigMut = trpc.channelManager.saveHotelSiteConfig.useMutation({ onSuccess: () => { toast.success(t("websiteBuilder.toastConfigSaved")); refetchConfig(); setSaveNote(t("websiteBuilder.savedViaNote")); }, onError: e => setFormError(e.message) });
  const saveThemeMut = trpc.channelManager.saveHotelSiteConfig.useMutation({ onSuccess: async () => { toast.success(t("websiteBuilder.themeSaved")); await refetchConfig(); }, onError: e => setFormError(e.message) });
  const publishConfigMut = trpc.channelManager.publishHotelSiteConfig.useMutation({ onSuccess: async () => { toast.success(t("websiteBuilder.publishSuccess")); await refetchConfig(); }, onError: e => setFormError(e.message) });
  const [draft, setDraft] = useState<SiteConfig>(() => defaultConfig(effectiveHotelId));
  const publishedConfig = useMemo(() => {
    const base = defaultConfig(effectiveHotelId);
    return { ...base, ...(serverConfig ?? {}), heroCopy: serverConfig?.heroCopy ?? base.heroCopy, accentColor: serverConfig?.accentColor ?? base.accentColor, visibleSections: { ...base.visibleSections, ...(serverConfig?.visibleSections ?? {}) } } as SiteConfig;
  }, [serverConfig, effectiveHotelId]);
  const storedDraft = useMemo(() => {
    if (!serverConfig?.draftJson) return null;
    try { return JSON.parse(serverConfig.draftJson) as SiteConfig & { heroMediaId?: string | null; mediaPositions?: Record<string, string | null>; mediaCaptions?: Record<string, string>; galleryMediaIds?: string[] }; } catch { return null; }
  }, [serverConfig]);
  const discardDraftMut = trpc.channelManager.discardHotelSiteConfigDraft.useMutation({ onSuccess: async () => { await refetchConfig(); setDraft(publishedConfig); toast.success(t("websiteBuilder.draftDiscarded")); }, onError: e => setFormError(e.message) });
  const config = storedDraft ?? publishedConfig;
  const [initializedFor, setInitializedFor] = useState("");
  const previewAccentColor = isValidHexColor(draft.accentColor) ? draft.accentColor : "#1d6b56";
  useEffect(() => {
    if (!effectiveHotelId || isFetchingConfig) return;
    if (initializedFor !== effectiveHotelId || serverConfig !== undefined) {
      setInitializedFor(effectiveHotelId); setDraft(storedDraft ?? publishedConfig); setFormError(null); setSaveNote(null);
    }
  }, [effectiveHotelId, serverConfig, isFetchingConfig, initializedFor, storedDraft, publishedConfig]);
  const media = serverMedia;
  const selectedGalleryIds: string[] = storedDraft?.galleryMediaIds ?? media.filter(item => item.isPublished && !item.isHero).slice(0, MAX_WEBSITE_GALLERY_PHOTOS).map(item => item.id);
  const draftMedia = media.map(item => ({ ...item, caption: storedDraft?.mediaCaptions?.[item.id] ?? displayPhotoCaption(item.caption), isHero: storedDraft?.heroMediaId ? item.id === storedDraft.heroMediaId : item.isHero, isGallerySelected: selectedGalleryIds.includes(item.id), objectPosition: Object.prototype.hasOwnProperty.call(storedDraft?.mediaPositions ?? {}, item.id) ? storedDraft?.mediaPositions?.[item.id] ?? null : item.objectPosition }));
  const heroImage = useMemo(() => draftMedia.find(m => m.isHero)?.url ?? draftMedia[0]?.url ?? null, [draftMedia]);
  const selectedHotelHeroImage = useMemo(() => draftMedia.find(m => m.isHero)?.url ?? null, [draftMedia]);
  const previewHotelName = selectedHotel?.name?.trim() || t("websiteBuilder.yourHotelName");
  const sectionLabels = useMemo(() => ({
    hero: { label: t("websiteBuilder.sectionHeroLabel"), hint: t("websiteBuilder.sectionHeroHint") },
    'story': { label: t("websiteBuilder.sectionStoryLabel"), hint: t("websiteBuilder.sectionStoryHint") },
    'rooms': { label: t("websiteBuilder.sectionRoomsLabel"), hint: t("websiteBuilder.sectionRoomsHint") },
    'booking': { label: t("websiteBuilder.sectionBookingLabel"), hint: t("websiteBuilder.sectionBookingHint") },
    'location': { label: t("websiteBuilder.sectionLocationLabel"), hint: t("websiteBuilder.sectionLocationHint") },
  }), [t]);
  function handleUploadFile(file: File) {
    setFormError(null);
    if (file.size > 5 * 1024 * 1024) { setFormError(t("websiteBuilder.errorFileTooLarge")); return; }
    const rawType = (file.type || "").split(";")[0].trim().toLowerCase();
    const normalizedType = rawType === "image/jpg" ? "image/jpeg" : rawType;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
    if (!allowedTypes.includes(normalizedType)) { setFormError(t("websiteBuilder.errorOnlyImages")); return; }
    const reader = new FileReader();
    reader.onload = () => { const url = String(reader.result ?? ""); if (!url) { setFormError(t("websiteBuilder.errorReadImage")); return; } uploadMediaMut.mutate({ hotel_id: effectiveHotelId, base64: url, filename: file.name }); toast.success(t("websiteBuilder.toastUploadStarted")); };
    reader.onerror = () => setFormError(t("websiteBuilder.errorReadImage")); reader.readAsDataURL(file);
  }
  function handleUploadFiles(files: FileList | null) { if (!files) return; for (const file of Array.from(files)) handleUploadFile(file); }
  function handleSetCaption(id: string, caption: string) { if (!canManage) return; setCaptionMut.mutate({ hotel_id: effectiveHotelId, media_id: id, caption: caption.trim() }); }
  function handleToggleGallery(id: string, shown: boolean) { if (!canManage) return; setFormError(null); setGalleryMut.mutate({ hotel_id: effectiveHotelId, media_id: id, shown }); }
  function handleDeleteMedia(id: string) { if (!canManage) { setFormError(t("websiteBuilder.errorNoPermissionDelete")); return; } deleteMediaMut.mutate({ hotel_id: effectiveHotelId, media_id: id }); }
  function handleSetHero(id: string) { if (!canManage) return; setHeroMut.mutate({ hotel_id: effectiveHotelId, media_id: id }, { onSuccess: () => { void refetchConfig(); } }); }
  function handleFocalPoint(event: React.PointerEvent<HTMLImageElement>, item: HotelMediaItem) {
    if (!canManage) return; setFocalMediaId(item.id); const rect = event.currentTarget.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const x = Math.round(Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)));
    const y = Math.round(Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)));
    setObjectPositionMut.mutate({ hotel_id: effectiveHotelId, media_id: item.id, object_position: `${x}% ${y}%` }, { onSuccess: () => { void refetchConfig(); } });
  }
  function handleSave() {
    setFormError(null); setSaveNote(null);
    if (!canManage) { setFormError(t("websiteBuilder.errorNoPermissionSave")); return; }
    if (!effectiveHotelId) { setFormError(t("websiteBuilder.errorSelectHotelFirst")); return; }
    if (!isValidHexColor(draft.accentColor)) { setFormError(t("websiteBuilder.errorInvalidHex")); return; }
    if (draft.heroCopy.trim().length === 0) { setFormError(t("websiteBuilder.errorHeroCopyEmpty")); return; }
    if (draft.heroCopy.length > 500) { setFormError(t("websiteBuilder.errorHeroCopyTooLong")); return; }
    saveConfigMut.mutate({ hotel_id: effectiveHotelId, hero_copy: draft.heroCopy, accent_color: draft.accentColor, visible_sections: draft.visibleSections });
  }
  function handleSaveTheme(theme: HotelThemeId) {
    setFormError(null); if (!canManage) { setFormError(t("websiteBuilder.errorNoPermissionSave")); return; }
    if (!effectiveHotelId) { setFormError(t("websiteBuilder.errorSelectHotelFirst")); return; }
    saveThemeMut.mutate({ hotel_id: effectiveHotelId, hero_copy: draft.heroCopy, accent_color: draft.accentColor, visible_sections: draft.visibleSections, theme, hero_media_id: storedDraft?.heroMediaId ?? media.find(item => item.isHero)?.id ?? null, media_positions: storedDraft?.mediaPositions ?? {} });
  }
  return { t, hotels, isLoading, isError, refetch, isFetching, canManage, canView, selectedHotelId, setSelectedHotelId, effectiveHotelId, selectedHotel, serverMedia, serverConfig, isFetchingMedia, isFetchingConfig, setPublished, uploadMediaMut, deleteMediaMut, setHeroMut, setObjectPositionMut, setCaptionMut, setGalleryMut, saveConfigMut, saveThemeMut, publishConfigMut, discardDraftMut, storedDraft, selectedGalleryIds, draft, setDraft, publishedConfig, config, previewAccentColor, focalMediaId, setFocalMediaId, fileInputRef, media, draftMedia, heroImage, selectedHotelHeroImage, previewHotelName, sectionLabels, formError, saveNote, handleUploadFile, handleUploadFiles, handleSetCaption, handleToggleGallery, handleDeleteMedia, handleSetHero, handleFocalPoint, handleSave, handleSaveTheme };
}
