import { useEffect, useRef, useState, type FormEvent } from 'react';
import { trpc } from '@/lib/trpc';
import { validateHotelContacts } from '@shared/hotelLocationRules';
import { hasHotelPermission } from '@shared/authorization';

export type HotelProfileForm = {
  name: string; address: string; owner_contact: string;
  latitude: number | null; longitude: number | null;
  public_phone: string; show_public_phone: boolean;
  facebook_url: string; show_facebook: boolean;
  line_url: string; show_line: boolean;
  instagram_url: string; show_instagram: boolean;
  x_url: string; show_x: boolean;
};

type HotelProfileSource = Partial<{ [K in keyof HotelProfileForm]: HotelProfileForm[K] | null }>;

export function formFromHotel(hotel: HotelProfileSource): HotelProfileForm {
  return {
    name: hotel.name ?? '', address: hotel.address ?? '', owner_contact: hotel.owner_contact ?? '',
    latitude: hotel.latitude ?? null, longitude: hotel.longitude ?? null,
    public_phone: hotel.public_phone ?? '', show_public_phone: Boolean(hotel.show_public_phone),
    facebook_url: hotel.facebook_url ?? '', show_facebook: Boolean(hotel.show_facebook),
    line_url: hotel.line_url ?? '', show_line: Boolean(hotel.show_line),
    instagram_url: hotel.instagram_url ?? '', show_instagram: Boolean(hotel.show_instagram),
    x_url: hotel.x_url ?? '', show_x: Boolean(hotel.show_x),
  };
}

export function profilePayload(id: string, form: HotelProfileForm) {
  return {
    hotel_id: id, name: form.name, address: form.address, owner_contact: form.owner_contact,
    latitude: form.latitude, longitude: form.longitude,
    public_phone: form.public_phone || null, show_public_phone: form.show_public_phone,
    facebook_url: form.facebook_url || null, show_facebook: form.show_facebook,
    line_url: form.line_url || null, show_line: form.show_line,
    instagram_url: form.instagram_url || null, show_instagram: form.show_instagram,
    x_url: form.x_url || null, show_x: form.show_x,
  };
}

export function useHotelProfileForm(id: string) {
  const utils = trpc.useUtils();
  const hotelQuery = trpc.channelManager.hotel.useQuery(id);
  const authMeQuery = trpc.auth.me.useQuery();
  const canManage = hasHotelPermission(authMeQuery.data?.roles ?? [], authMeQuery.data?.memberships ?? [], id, 'property.manage_profile');
  const [form, setForm] = useState<HotelProfileForm>(() => formFromHotel({}));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const initializedId = useRef<string | null>(null);
  useEffect(() => {
    if (initializedId.current === id || !hotelQuery.data || hotelQuery.data.id !== id) return;
    setForm(formFromHotel(hotelQuery.data));
    setError(null);
    setSaved(false);
    initializedId.current = id;
  }, [id, hotelQuery.data]);
  const updateHotelProfile = trpc.channelManager.updateHotelProfile.useMutation({
    onSuccess: async () => {
      setError(null);
      setSaved(true);
      await Promise.all([
        utils.channelManager.hotel.invalidate(id),
        utils.channelManager.hotels.invalidate(),
        utils.channelManager.dashboard.invalidate(),
      ]);
    },
    onError: mutationError => { setSaved(false); setError(mutationError.message); },
  });
  function change<K extends keyof HotelProfileForm>(key: K, value: HotelProfileForm[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
    setSaved(false);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const contactError = validateHotelContacts({
      phone: form.public_phone, facebook: form.facebook_url, line: form.line_url,
      instagram: form.instagram_url, x: form.x_url,
      showPhone: form.show_public_phone, showFacebook: form.show_facebook,
      showLine: form.show_line, showInstagram: form.show_instagram, showX: form.show_x,
    });
    if (contactError) { setError(contactError); return; }
    updateHotelProfile.mutate(profilePayload(id, form));
  }
  return { hotelQuery, authLoading: authMeQuery.isLoading, canManage, form, change, submit, error, saved, isPending: updateHotelProfile.isPending, retry: () => void utils.channelManager.hotel.invalidate(id) };
}
