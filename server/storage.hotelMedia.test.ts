import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadHotelMediaToStorage, deleteHotelMediaFromStorage, HOTEL_MEDIA_BUCKET } from './storage';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('Supabase Storage hotel-media helper', () => {
  const hotelId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  const buffer = Buffer.from('test-image-data');

  let mockUpload: ReturnType<typeof vi.fn>;
  let mockGetPublicUrl: ReturnType<typeof vi.fn>;
  let mockRemove: ReturnType<typeof vi.fn>;
  let mockClient: SupabaseClient;

  beforeEach(() => {
    mockUpload = vi.fn().mockResolvedValue({ data: { path: 'uploaded-path' }, error: null });
    mockGetPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${HOTEL_MEDIA_BUCKET}/${hotelId}/image_123.jpg` },
    });
    mockRemove = vi.fn().mockResolvedValue({ data: [], error: null });

    mockClient = {
      storage: {
        from: vi.fn((bucket: string) => {
          expect(bucket).toBe(HOTEL_MEDIA_BUCKET);
          return {
            upload: mockUpload,
            getPublicUrl: mockGetPublicUrl,
            remove: mockRemove,
          };
        }),
      },
    } as unknown as SupabaseClient;
  });

  it('uploads to hotel-media bucket under hotel_id path prefix and returns public URL', async () => {
    const result = await uploadHotelMediaToStorage(
      mockClient,
      hotelId,
      'hero photo.png',
      buffer,
      'image/png',
    );

    expect(result.url).toContain(HOTEL_MEDIA_BUCKET);
    expect(mockUpload).toHaveBeenCalledOnce();

    const [uploadedPath, uploadedBuffer, options] = mockUpload.mock.calls[0];
    expect(uploadedPath).toMatch(new RegExp(`^${hotelId}/hero_photo_[0-9]+_[0-9a-f]+\\.png$`));
    expect(uploadedBuffer).toBe(buffer);
    expect(options).toEqual({
      contentType: 'image/png',
      upsert: false,
    });
    expect(mockGetPublicUrl).toHaveBeenCalledWith(uploadedPath);
  });

  it('throws an error when Supabase Storage returns an upload error', async () => {
    mockUpload.mockResolvedValueOnce({
      data: null,
      error: { message: 'Bucket not found or permission denied' },
    });

    await expect(
      uploadHotelMediaToStorage(mockClient, hotelId, 'fail.jpg', buffer, 'image/jpeg'),
    ).rejects.toThrow('Failed to upload media to storage: Bucket not found or permission denied');
  });

  it('removes file from storage bucket when given a full public URL', async () => {
    const publicUrl = `https://example.supabase.co/storage/v1/object/public/${HOTEL_MEDIA_BUCKET}/${hotelId}/villa_999.webp`;
    await deleteHotelMediaFromStorage(mockClient, publicUrl);

    expect(mockRemove).toHaveBeenCalledWith([`${hotelId}/villa_999.webp`]);
  });

  it('removes file from storage bucket when given a relative object path', async () => {
    const relativePath = `${hotelId}/room_123.jpg`;
    await deleteHotelMediaFromStorage(mockClient, relativePath);

    expect(mockRemove).toHaveBeenCalledWith([relativePath]);
  });

  it('silently ignores external or unparseable URLs without throwing', async () => {
    await deleteHotelMediaFromStorage(mockClient, 'https://images.unsplash.com/photo-123');
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
