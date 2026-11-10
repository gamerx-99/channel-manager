import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { hasAnyPermission, hasHotelPermission, type AppRole } from "@shared/authorization";
import { HOTEL_THEMES, MAX_WEBSITE_GALLERY_PHOTOS, getHotelThemeColors, type HotelThemeId } from "@shared/hotelThemes";
import { uploadHotelMediaFile } from "@/lib/hotelMedia";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";
import { defaultConfig, themeSaveErrorMessage, type SiteConfig } from "./websiteBuilderRules";
import { displayPhotoCaption } from "@shared/websitePhotos";
import { splitWebsitePhotos } from "./photoReorder";

export type HotelMediaItem = inferRouterOutputs<AppRouter>["channelManager"]["listHotelMedia"][number];

// Wire to tRPC hotel_site_config router (saveHotelSiteConfig / getHotelSiteConfig) and hotel_media write path.
// (uploadHotelMedia / deleteHotelMedia / listHotelMedia / setHotelMediaHero).
// hotel_domains custom-domain flow is intentionally deferred (see DECISIONS.md) and not wired here.

export function useWebsiteBuilder() {
  const { t, language } = useTranslation();
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
  // Photo errors (upload, delete, gallery limit) show inside the photos card, next to the control that caused them.
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [focalMediaId, setFocalMediaId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadMediaMut = useMutation({
    mutationFn: ({ hotel_id, ...file }: { hotel_id: string; base64: string; filename: string }) => uploadHotelMediaFile(hotel_id, file),
    onSuccess: () => { toast.success(t("websiteBuilder.toastImageUploaded")); refetchMedia(); },
    onError: (e: Error) => setPhotoError(e.message),
  });
  // The server also removes a deleted photo from the stored draft, so the config is refetched too.
  const deleteMediaMut = trpc.channelManager.deleteHotelMedia.useMutation({ onSuccess: () => { toast.success(t("websiteBuilder.toastImageDeleted")); refetchMedia(); void refetchConfig(); }, onError: e => setPhotoError(e.message) });
  const setHeroMut = trpc.channelManager.setHotelMediaHero.useMutation({ onSuccess: () => { toast.success(t("websiteBuilder.toastHeroUpdated")); refetchMedia(); }, onError: e => setPhotoError(e.message) });
  const setObjectPositionMut = trpc.channelManager.setHotelMediaObjectPosition.useMutation({ onSuccess: () => refetchMedia(), onError: e => setPhotoError(e.message) });
  const setCaptionMut = trpc.channelManager.setHotelMediaCaption.useMutation({ onSuccess: () => refetchConfig(), onError: e => setPhotoError(e.message) });
  const setGalleryMut = trpc.channelManager.setHotelMediaGallerySelection.useMutation({ onSuccess: () => refetchConfig(), onError: e => setPhotoError(e.message.includes("six gallery") ? t("websiteBuilder.galleryLimitReached") : e.message) });
  const reorderMediaMut = trpc.channelManager.reorderHotelMedia.useMutation({ onSuccess: () => { void refetchConfig(); }, onError: e => setPhotoError(e.message) });
  const saveConfigMut = trpc.channelManager.saveHotelSiteConfig.useMutation({ onSuccess: () => { toast.success(t("websiteBuilder.toastConfigSaved")); refetchConfig(); setSaveNote(t("websiteBuilder.savedViaNote")); }, onError: e => setFormError(e.message) });
  const saveThemeMut = trpc.channelManager.saveHotelSiteConfig.useMutation({ onSuccess: async () => { toast.success(t("websiteBuilder.themeSaved")); await refetchConfig(); }, onError: e => setFormError(themeSaveErrorMessage(e.message, t("websiteBuilder.themeMediaPositionError"))) });
  const publishConfigMut = trpc.channelManager.publishHotelSiteConfig.useMutation({ onSuccess: async () => { toast.success(t("websiteBuilder.publishSuccess")); await refetchConfig(); }, onError: e => setFormError(e.message) });
  const [draft, setDraft] = useState<SiteConfig>(() => ({ ...defaultConfig(effectiveHotelId), heroCopy: t("publicHotel.defaultHeroCopy") }));
  const publishedConfig = useMemo(() => {
    const base = defaultConfig(effectiveHotelId);
    return { ...base, ...(serverConfig ?? {}), heroCopy: serverConfig?.heroCopy ?? t("publicHotel.defaultHeroCopy"), visibleSections: { ...base.visibleSections, ...(serverConfig?.visibleSections ?? {}) } } as SiteConfig;
  }, [serverConfig, effectiveHotelId, language]);
  const storedDraft = useMemo(() => {
    if (!serverConfig?.draftJson) return null;
    try { return JSON.parse(serverConfig.draftJson) as SiteConfig & { heroMediaId?: string | null; mediaPositions?: Record<string, string | null>; mediaCaptions?: Record<string, string>; galleryMediaIds?: string[] }; } catch { return null; }
  }, [serverConfig]);
  const discardDraftMut = trpc.channelManager.discardHotelSiteConfigDraft.useMutation({ onSuccess: async () => { await refetchConfig(); setDraft(publishedConfig); toast.success(t("websiteBuilder.draftDiscarded")); }, onError: e => setFormError(e.message) });
  const config = storedDraft ?? publishedConfig;
  const [initializedFor, setInitializedFor] = useState("");
  const previewAccentColor = getHotelThemeColors(draft.theme).buttonBackground;
  useEffect(() => {
    if (!effectiveHotelId || isFetchingConfig) return;
    // Load the draft once per hotel. Re-running on every refetch (caption, gallery and focal
    // point edits all refetch the config) overwrote text and colour the owner had typed but not saved.
    if (initializedFor !== effectiveHotelId) {
      setInitializedFor(effectiveHotelId); setDraft(storedDraft ?? publishedConfig); setFormError(null); setSaveNote(null);
    }
  }, [effectiveHotelId, isFetchingConfig, initializedFor, storedDraft, publishedConfig]);
  const media = serverMedia;
  const selectedGalleryIds: string[] = storedDraft?.galleryMediaIds ?? media.filter(item => item.isPublished && !item.isHero).slice(0, MAX_WEBSITE_GALLERY_PHOTOS).map(item => item.id);
  const draftMedia = media.map(item => ({ ...item, caption: storedDraft?.mediaCaptions?.[item.id] ?? displayPhotoCaption(item.caption), isHero: storedDraft?.heroMediaId ? item.id === storedDraft.heroMediaId : item.isHero, isGallerySelected: selectedGalleryIds.includes(item.id), objectPosition: Object.prototype.hasOwnProperty.call(storedDraft?.mediaPositions ?? {}, item.id) ? storedDraft?.mediaPositions?.[item.id] ?? null : item.objectPosition }));
  // Cover first, then the gallery in draft order: the only photos the owner can reorder.
  const draftCoverId = storedDraft?.heroMediaId ?? media.find(item => item.isHero)?.id ?? null;
  const { hasCover, ordered: orderedPhotos, others: otherPhotos } = splitWebsitePhotos(draftMedia, draftCoverId, selectedGalleryIds);
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
    setPhotoError(null);
    if (file.size > 5 * 1024 * 1024) { setPhotoError(t("websiteBuilder.errorFileTooLarge")); return; }
    const rawType = (file.type || "").split(";")[0].trim().toLowerCase();
    const normalizedType = rawType === "image/jpg" ? "image/jpeg" : rawType;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
    if (!allowedTypes.includes(normalizedType)) { setPhotoError(t("websiteBuilder.errorOnlyImages")); return; }
    const reader = new FileReader();
    reader.onload = () => { const url = String(reader.result ?? ""); if (!url) { setPhotoError(t("websiteBuilder.errorReadImage")); return; } uploadMediaMut.mutate({ hotel_id: effectiveHotelId, base64: url, filename: file.name }); toast.success(t("websiteBuilder.toastUploadStarted")); };
    reader.onerror = () => setPhotoError(t("websiteBuilder.errorReadImage")); reader.readAsDataURL(file);
  }
  function handleUploadFiles(files: FileList | null) { if (!files) return; for (const file of Array.from(files)) handleUploadFile(file); }
  function handleSetCaption(id: string, caption: string) { if (!canManage) return; setCaptionMut.mutate({ hotel_id: effectiveHotelId, media_id: id, caption: caption.trim() }); }
  function handleToggleGallery(id: string, shown: boolean) { if (!canManage) return; setPhotoError(null); setGalleryMut.mutate({ hotel_id: effectiveHotelId, media_id: id, shown }); }
  function handleDeleteMedia(id: string) {
    if (!canManage) { setPhotoError(t("websiteBuilder.errorNoPermissionDelete")); return; }
    // A photo is removed from storage immediately and cannot be recovered, so ask first.
    if (typeof window !== "undefined" && !window.confirm(t("websiteBuilder.confirmDeleteMedia"))) return;
    setPhotoError(null);
    deleteMediaMut.mutate({ hotel_id: effectiveHotelId, media_id: id });
  }
  function handleSetHero(id: string) { if (!canManage) return; setHeroMut.mutate({ hotel_id: effectiveHotelId, media_id: id }, { onSuccess: () => { void refetchConfig(); } }); }
  function handleReorderPhotos(ids: string[]) { if (!canManage) return; setPhotoError(null); reorderMediaMut.mutate({ hotel_id: effectiveHotelId, ids }); }
  async function handleFocalPoint(mediaId: string, objectPosition: string | null): Promise<boolean> {
    if (!canManage) return false;
    setPhotoError(null);
    try {
      await setObjectPositionMut.mutateAsync({ hotel_id: effectiveHotelId, media_id: mediaId, object_position: objectPosition });
      void refetchConfig();
      return true;
    } catch {
      return false;
    }
  }
  // Shared by "save draft" and "choose a design": both send the headline to the server.
  function draftProblem(): string | null {
    if (!canManage) return t("websiteBuilder.errorNoPermissionSave");
    if (!effectiveHotelId) return t("websiteBuilder.errorSelectHotelFirst");
    if (draft.heroCopy.trim().length === 0) return t("websiteBuilder.errorHeroCopyEmpty");
    if (draft.heroCopy.length > 500) return t("websiteBuilder.errorHeroCopyTooLong");
    return null;
  }
  function handleSave() {
    setFormError(null); setSaveNote(null);
    const problem = draftProblem();
    if (problem) { setFormError(problem); return; }
    saveConfigMut.mutate({ hotel_id: effectiveHotelId, hero_copy: draft.heroCopy, visible_sections: draft.visibleSections });
  }
  function handleSaveTheme(theme: HotelThemeId) {
    setFormError(null);
    const problem = draftProblem();
    if (problem) { setFormError(problem); return; }
    saveThemeMut.mutate({ hotel_id: effectiveHotelId, hero_copy: draft.heroCopy, visible_sections: draft.visibleSections, theme, hero_media_id: storedDraft?.heroMediaId ?? media.find(item => item.isHero)?.id ?? null, media_positions: storedDraft?.mediaPositions ?? {} });
  }
  return { t, hotels, isLoading, isError, refetch, isFetching, canManage, canView, selectedHotelId, setSelectedHotelId, effectiveHotelId, selectedHotel, serverMedia, serverConfig, isFetchingMedia, isFetchingConfig, setPublished, uploadMediaMut, deleteMediaMut, setHeroMut, setObjectPositionMut, setCaptionMut, setGalleryMut, reorderMediaMut, saveConfigMut, saveThemeMut, publishConfigMut, discardDraftMut, storedDraft, selectedGalleryIds, draft, setDraft, publishedConfig, config, previewAccentColor, focalMediaId, setFocalMediaId, fileInputRef, media, draftMedia, hasCover, orderedPhotos, otherPhotos, heroImage, selectedHotelHeroImage, previewHotelName, sectionLabels, formError, photoError, saveNote, handleUploadFile, handleUploadFiles, handleSetCaption, handleToggleGallery, handleDeleteMedia, handleSetHero, handleReorderPhotos, handleFocalPoint, handleSave, handleSaveTheme };
}
