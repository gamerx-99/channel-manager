import { useMemo, useRef, useState } from "react";
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
import { hasAnyPermission, type AppRole } from "@shared/authorization";
import { toast } from "sonner";

// Wire to tRPC hotel_site_config router (saveHotelSiteConfig / getHotelSiteConfig) and hotel_media write path
// (uploadHotelMedia / deleteHotelMedia / listHotelMedia / setHotelMediaHero).
// Hotel_domains custom-domain flow is intentionally deferred (see DECISIONS.md) and not wired here.

type MediaItem = {
  id: string;
  url: string;
  caption: string | null;
  is_hero: boolean;
  display_order: number;
};

type SiteConfig = {
  hotel_id: string;
  hero_copy: string;
  accent_color: string;
  visible_sections: {
    hero: boolean;
    story: boolean;
    rooms: boolean;
    booking: boolean;
    location: boolean;
  };
};

const DEFAULT_VISIBLE_SECTIONS: SiteConfig["visible_sections"] = {
  hero: true,
  story: true,
  rooms: true,
  booking: true,
  location: true,
};

const SECTION_LABELS: Record<keyof SiteConfig["visible_sections"], { label: string; hint: string }> = {
  hero: { label: "Hero banner", hint: "Top image + headline" },
  story: { label: "Story / The hotel", hint: "Intro section" },
  rooms: { label: "Rooms", hint: "Room grid" },
  booking: { label: "Your stay / Booking", hint: "Dates CTA" },
  location: { label: "Location", hint: "Address card" },
};

function defaultConfig(hotelId: string): SiteConfig {
  return {
    hotel_id: hotelId,
    hero_copy: "Explore room types, rates, and availability directly from this hotel.",
    accent_color: "#1d6b56",
    visible_sections: { ...DEFAULT_VISIBLE_SECTIONS },
  };
}

function isValidHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function LoadingWebsiteBuilder() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="กำลังโหลดเว็บไซต์โรงแรม">
      <div className="flex items-center gap-3 rounded-xl border border-[#dce4df] bg-[#f6faf7] px-4 py-3 text-sm text-[#456156]">
        <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-[#9bbcae] border-t-[#1d6b56]" aria-hidden="true" />
        <span>Loading website builder…</span>
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

function seedMediaForHotel(hotelName: string): MediaItem[] {
  // Placeholder preview images as data URIs are not needed — use empty seed and let the user upload.
  // Keep a deterministic empty array so the contract test for preview rendering stays stable.
  void hotelName;
  return [];
}

export default function WebsiteBuilder() {
  const { data: hotels, isLoading, isError, refetch, isFetching } = trpc.channelManager.hotels.useQuery();
  const { data: authMe } = trpc.auth.me.useQuery();
  const authRoles = (authMe?.roles?.length ? authMe.roles : authMe?.role ? [authMe.role] : []) as AppRole[];
  const canManage = hasAnyPermission(authRoles, "property.manage_profile");
  const canView = hasAnyPermission(authRoles, "property.view");

  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
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

  const uploadMediaMut = trpc.channelManager.uploadHotelMedia.useMutation({
    onSuccess: () => { toast.success("Image uploaded"); refetchMedia(); },
    onError: (e) => setFormError(e.message)
  });

  const deleteMediaMut = trpc.channelManager.deleteHotelMedia.useMutation({
    onSuccess: () => { toast.success("Image deleted"); refetchMedia(); },
    onError: (e) => setFormError(e.message)
  });

  const setHeroMut = trpc.channelManager.setHotelMediaHero.useMutation({
    onSuccess: () => { toast.success("Hero image updated"); refetchMedia(); },
    onError: (e) => setFormError(e.message)
  });

  const saveConfigMut = trpc.channelManager.saveHotelSiteConfig.useMutation({
    onSuccess: () => { toast.success("Site config saved"); refetchConfig(); setSaveNote("Saved via saveHotelSiteConfig"); },
    onError: (e) => setFormError(e.message)
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const media = serverMedia;
  const config = serverConfig ?? defaultConfig(effectiveHotelId);

  // Initialize draft form from config when hotel or config changes
  const [draft, setDraft] = useState<SiteConfig>(() => defaultConfig(effectiveHotelId));
  const [initializedFor, setInitializedFor] = useState<string>("");
  
  if (effectiveHotelId && (initializedFor !== effectiveHotelId || JSON.stringify(serverConfig) !== JSON.stringify(draft) && saveNote === null)) {
    // Only auto-sync if we haven't modified the draft or just switched hotels
    if (initializedFor !== effectiveHotelId || !saveNote) {
      setInitializedFor(effectiveHotelId);
      setDraft(config as SiteConfig);
      setFormError(null);
      if (initializedFor !== effectiveHotelId) setSaveNote(null);
    }
  }

  const heroImage = useMemo(() => media.find(m => m.is_hero)?.url ?? media[0]?.url ?? null, [media]);

  function handleUploadFile(file: File) {
    setFormError(null);
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setFormError("Image too large — limit is 5 MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setFormError("Only image files are supported.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      if (!url) {
        setFormError("Could not read image file.");
        return;
      }
      const next = {
        hotel_id: effectiveHotelId,
        base64: url,
        filename: file.name,
      };
      uploadMediaMut.mutate(next);
      toast.success("Image upload started...");
    };
    reader.onerror = () => setFormError("Could not read image file.");
    reader.readAsDataURL(file);
  }

  function handleDeleteMedia(id: string) {
    if (!canManage) {
      setFormError("You do not have permission to delete media (requires property.manage_profile).");
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
      setFormError("You do not have permission to save site config (requires property.manage_profile).");
      return;
    }
    if (!effectiveHotelId) {
      setFormError("Select a hotel first.");
      return;
    }
    if (!isValidHexColor(draft.accent_color)) {
      setFormError("Accent color must be a hex color like #1d6b56.");
      return;
    }
    if (draft.hero_copy.trim().length === 0) {
      setFormError("Hero copy cannot be empty.");
      return;
    }
    if (draft.hero_copy.length > 500) {
      setFormError("Hero copy must be 500 characters or fewer.");
      return;
    }
    saveConfigMut.mutate({
      hotel_id: effectiveHotelId,
      hero_copy: draft.hero_copy,
      accent_color: draft.accent_color,
      visible_sections: draft.visible_sections,
    });
  }

  if (isLoading) return <LoadingWebsiteBuilder />;

  if (isError || !hotels) {
    return (
      <PageState
        tone="error"
        title="Unable to load website builder"
        description="The website builder workspace could not be loaded for the properties visible to your account."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  if (!canView) {
    return (
      <PageState
        tone="error"
        title="Access restricted"
        description="Your current role does not have permission to view the website builder (requires property.view or property.manage_profile)."
      />
    );
  }

  if (!hotels.length) {
    return (
      <PageState
        tone="empty"
        title="No hotels available"
        description="Create a hotel first before customizing its public site."
      />
    );
  }

  return (
    <div className="space-y-7 pb-8">
      <section className="flex flex-col gap-5 border-b border-[#dce4df] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Property / Website Builder</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#1b2c25] sm:text-4xl">Website Builder</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6c7e75]">
            Upload media with preview, and customize hero_copy, accent_color, and visible_sections for your public hotel page. Saved config is applied to the public preview and will persist via saveHotelSiteConfig / getHotelSiteConfig.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#70837a]">
          <Clock3 size={14} aria-hidden="true" />
          <span>Per-hotel site config</span>
          {isFetching || isFetchingMedia || isFetchingConfig || uploadMediaMut.isPending || saveConfigMut.isPending || deleteMediaMut.isPending || setHeroMut.isPending ? <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#b7c9c0] border-t-[#1d6b56]" aria-label="กำลังอัปเดตข้อมูล" /> : null}
        </div>
      </section>

      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Hotel selector">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#263b31]">
          <Globe size={16} aria-hidden="true" /> Hotel
        </div>
        <div className="w-full sm:max-w-sm">
          <Select value={effectiveHotelId} onValueChange={setSelectedHotelId}>
            <SelectTrigger className="border-[#dce4df] bg-white">
              <SelectValue placeholder="Select hotel" />
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

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Website builder summary">
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">Media items</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#263b31]">{media.length}</p>
            <p className="mt-1 text-xs text-[#778a80]">Upload/delete with preview</p>
          </CardContent>
        </Card>
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">Accent color</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="h-6 w-6 rounded-full border border-[#dce4df]" style={{ background: draft.accent_color }} aria-hidden="true" />
              <span className="text-sm font-mono font-semibold text-[#263b31]">{draft.accent_color}</span>
            </div>
            <p className="mt-1 text-xs text-[#778a80]">accent_color</p>
          </CardContent>
        </Card>
        <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#789087]">Visible sections</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#263b31]">{Object.values(draft.visible_sections).filter(Boolean).length} / 5</p>
            <p className="mt-1 text-xs text-[#778a80]">visible_sections toggles</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-5">
          <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
            <CardHeader className="border-b border-[#edf2ee] pb-4">
              <CardTitle className="flex items-center gap-2 text-lg text-[#263b31]">
                <ImageIcon size={18} aria-hidden="true" /> Media — upload / preview / delete
              </CardTitle>
              <CardDescription>Upload images for this hotel, preview them, and delete or mark one as hero. Validates size/type before upload.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {!canManage && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="note">
                  View-only — upload and delete require property.manage_profile.
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadFile(file);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  aria-label="Upload media"
                />
                <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={!canManage} className="bg-[#1d6b56] hover:bg-[#155442] disabled:opacity-50">
                  <Upload size={15} /> Upload image
                </Button>
                <span className="text-xs text-[#778a80]">PNG/JPG/WebP, max 5 MB. Preview updates immediately.</span>
              </div>

              {media.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {media.map(item => (
                    <div key={item.id} className="group overflow-hidden rounded-xl border border-[#e6eee9] bg-white">
                      <div className="relative aspect-[16/10] overflow-hidden bg-[#f6faf7]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.url} alt={item.caption ?? "Hotel media preview"} className="h-full w-full object-cover" />
                        {item.is_hero && (
                          <span className="absolute left-2 top-2 rounded-full bg-[#1d6b56] px-2 py-0.5 text-[11px] font-semibold text-white">Hero</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-[#2a4035]">{item.caption ?? item.id.slice(0, 8)}</p>
                          <p className="text-[11px] text-[#778a80]">{item.is_hero ? "Hero image" : "Gallery"} · display_order {item.display_order}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={`h-7 border-[#dce4df] px-2 text-xs ${item.is_hero ? "bg-[#edf7f1] text-[#1d6b56]" : "bg-white"}`}
                            onClick={() => handleSetHero(item.id)}
                            disabled={!canManage || item.is_hero}
                            aria-label={`Set hero ${item.id}`}
                          >
                            Hero
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-[#8a9a93] hover:text-red-600"
                            onClick={() => handleDeleteMedia(item.id)}
                            disabled={!canManage}
                            aria-label={`Delete media ${item.id}`}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <PageState tone="empty" title="No media yet" description="Upload an image to see the preview grid. The first upload becomes the hero image." />
              )}
              <p className="text-xs leading-5 text-[#778a80]">
                Media is managed via hotel_media upload/delete. hero_copy / accent_color / visible_sections live in hotel_site_config.
              </p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
            <CardHeader className="border-b border-[#edf2ee] pb-4">
              <CardTitle className="flex items-center gap-2 text-lg text-[#263b31]">
                <Eye size={18} aria-hidden="true" /> Public preview
              </CardTitle>
              <CardDescription>Reflects hero_copy, accent_color, and visible_sections as they will appear on PublicHotel.</CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="overflow-hidden rounded-xl border border-[#e6eee9] bg-white">
                {config?.visible_sections?.hero ? (
                  <div className="relative h-[220px] overflow-hidden bg-[#f6faf7]">
                    {heroImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={heroImage} alt={`Preview for ${selectedHotel?.name ?? "hotel"}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-[#7a8c83]">No hero image — upload one above</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" aria-hidden="true" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-lg font-semibold text-white">{selectedHotel?.name ?? "Your hotel preview"}</h3>
                      <p className="mt-1 max-w-xl text-sm leading-6 text-white/90">{draft.hero_copy || config.hero_copy}</p>
                      <span
                        className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold text-white"
                        style={{ background: draft.accent_color }}
                      >
                        View rooms
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3 text-xs text-[#7a8c83]">Hero section hidden (visible_sections.hero is off)</div>
                )}

                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  {config?.visible_sections?.story ? (
                    <div className="rounded-lg border border-[#e6eee9] bg-[#fbfdfb] p-3">
                      <p className="text-xs font-semibold text-[#263b31]">The hotel</p>
                      <p className="mt-1 text-xs leading-5 text-[#6c7e75]">Stay at {selectedHotel?.name ?? "this hotel"}.</p>
                    </div>
                  ) : null}
                  {config?.visible_sections?.rooms ? (
                    <div className="rounded-lg border border-[#e6eee9] bg-[#fbfdfb] p-3">
                      <p className="text-xs font-semibold text-[#263b31]">Rooms</p>
                      <p className="mt-1 text-xs leading-5 text-[#6c7e75]">{selectedHotel?.room_types?.length ?? 0} room type(s) from hotel data · preview grid would appear here</p>
                    </div>
                  ) : null}
                  {config?.visible_sections?.booking ? (
                    <div className="rounded-lg border border-[#e6eee9] bg-[#fbfdfb] p-3">
                      <p className="text-xs font-semibold text-[#263b31]">Your stay</p>
                      <p className="mt-1 text-xs leading-5 text-[#6c7e75]">Booking card preview — accent button uses accent_color</p>
                      <span className="mt-2 inline-flex rounded-md px-2.5 py-1 text-xs font-semibold text-white" style={{ background: draft.accent_color }}>
                        Plan visit
                      </span>
                    </div>
                  ) : null}
                  {config?.visible_sections?.location ? (
                    <div className="rounded-lg border border-[#e6eee9] bg-[#fbfdfb] p-3">
                      <p className="text-xs font-semibold text-[#263b31]">Location</p>
                      <p className="mt-1 text-xs leading-5 text-[#6c7e75]">{selectedHotel?.address ?? "Address from hotel profile"}</p>
                    </div>
                  ) : null}
                  {!Object.values(draft.visible_sections).some(Boolean) && (
                    <div className="col-span-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">All sections hidden — toggle at least one visible section.</div>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#667a70]">
                PublicHotel.tsx should read hotel_site_config (falling back to defaults when a hotel has no config). This preview mirrors that fallback.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
            <CardHeader className="border-b border-[#edf2ee] pb-4">
              <CardTitle className="flex items-center gap-2 text-lg text-[#263b31]">
                <Palette size={18} aria-hidden="true" /> Site config
              </CardTitle>
              <CardDescription>hero_copy, accent_color, visible_sections — gated by property.manage_profile. Save via saveHotelSiteConfig.</CardDescription>
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
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Requires property.manage_profile to save.</div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="wb-hero-copy" className="text-xs text-[#52655b]">
                  hero_copy
                </Label>
                <Textarea
                  id="wb-hero-copy"
                  value={draft.hero_copy}
                  onChange={e => setDraft(p => ({ ...p, hero_copy: e.target.value }))}
                  disabled={!canManage}
                  className="min-h-[96px] border-[#dce4df]"
                  placeholder="Explore room types, rates, and availability directly from this hotel."
                  maxLength={500}
                  aria-label="hero_copy"
                />
                <p className="text-[11px] text-[#778a80]">{draft.hero_copy.length} / 500</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wb-accent-color" className="text-xs text-[#52655b]">
                  accent_color
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="wb-accent-color"
                    type="color"
                    value={isValidHexColor(draft.accent_color) ? draft.accent_color : "#1d6b56"}
                    onChange={e => setDraft(p => ({ ...p, accent_color: e.target.value }))}
                    disabled={!canManage}
                    className="h-9 w-14 border-[#dce4df] p-1"
                    aria-label="accent_color picker"
                  />
                  <Input
                    placeholder="#1d6b56"
                    value={draft.accent_color}
                    onChange={e => setDraft(p => ({ ...p, accent_color: e.target.value }))}
                    disabled={!canManage}
                    className="flex-1 border-[#dce4df] font-mono text-sm"
                    aria-label="accent_color"
                  />
                </div>
                <p className="text-[11px] text-[#778a80]">Hex color, e.g. #1d6b56. Used for hero CTA and accent buttons.</p>
              </div>

              <div className="space-y-3">
                <Label className="text-xs text-[#52655b]">visible_sections</Label>
                <div className="space-y-2 rounded-xl border border-[#e6eee9] bg-[#fbfdfb] p-3">
                  {(Object.keys(SECTION_LABELS) as Array<keyof SiteConfig["visible_sections"]>).map(key => (
                    <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-[#e5ebe7] bg-white px-3 py-2.5">
                      <span>
                        <span className="text-sm font-medium text-[#263b31]">{SECTION_LABELS[key].label}</span>
                        <span className="ml-2 text-xs text-[#7a8c83]">{SECTION_LABELS[key].hint}</span>
                      </span>
                      <Switch
                        checked={draft.visible_sections[key]}
                        onCheckedChange={v => setDraft(p => ({ ...p, visible_sections: { ...p.visible_sections, [key]: v } }))}
                        disabled={!canManage}
                        aria-label={`visible_sections ${key}`}
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-[#778a80]">Toggles map to visible_sections json for PublicHotel. At least one section should remain visible.</p>
              </div>

              <Button type="button" onClick={handleSave} disabled={!canManage} className="w-full bg-[#1d6b56] hover:bg-[#155442] disabled:opacity-50">
                <Save size={15} /> Save site config
              </Button>
              <p className="text-xs leading-5 text-[#778a80]">
                Persists via saveHotelSiteConfig / getHotelSiteConfig per hotel_id. hotel_domains custom-domain flow is deferred (see DECISIONS.md).
              </p>
            </CardContent>
          </Card>

          <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
            <CardHeader className="border-b border-[#edf2ee] pb-4">
              <CardTitle className="text-sm text-[#263b31]">About hotel_domains</CardTitle>
              <CardDescription>Custom domains are deferred in this iteration — media + site config ship first.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-xs leading-5 text-[#6c7e75]">
                See DECISIONS.md for the hotel_domains deferral note. Provisioning / Vercel verification will be a follow-up spec; this page does not accept domain input today.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
