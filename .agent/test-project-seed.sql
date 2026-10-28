-- Test data for the NEW Supabase project `test-channel-manager`. Run it once in that project's
-- SQL editor AFTER every migration has been applied. NEVER run it in the live project.
-- It creates one public hotel (slug: test-local), 3 room types with rooms, 5 photos, 2 add-ons,
-- a site config and a PromptPay ID, so the spec 16 themes and the 5-step booking can be tested.
-- The SQL editor runs as the database owner, so row-level security does not get in the way.
-- Safe to re-run: it stops quietly if the hotel already exists.

DO $$
DECLARE
  -- 1) REPLACE THIS with a PromptPay ID you own for testing (a 10-digit phone number or a
  --    13-digit national/tax ID). It only draws a QR. Nobody pays, because the test stops there.
  test_promptpay_id constant text := 'REPLACE_ME';

  h uuid;
  rt_king uuid;
  rt_terrace uuid;
  rt_loft uuid;
BEGIN
  IF test_promptpay_id = 'REPLACE_ME' THEN
    RAISE EXCEPTION 'Edit test_promptpay_id at the top of this script first.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hotels WHERE slug = 'test-local') THEN
    RAISE NOTICE 'Hotel test-local already exists, nothing changed.';
    RETURN;
  END IF;

  INSERT INTO public.hotels (name, slug, address, owner_contact, public_enabled)
  VALUES ('Haus Nimman (TEST)', 'test-local', 'Nimman Soi 1, Suthep, Mueang Chiang Mai 50200',
          'test-owner@example.com', true)
  RETURNING id INTO h;

  INSERT INTO public.room_types (hotel_id, name, capacity, base_price, base_occupancy, max_occupancy, child_rule, child_rule_limit)
  VALUES (h, 'Standard King', 2, 1800, 2, 2, 'age', 6) RETURNING id INTO rt_king;
  INSERT INTO public.room_types (hotel_id, name, capacity, base_price, base_occupancy, max_occupancy, child_rule, child_rule_limit)
  VALUES (h, 'Studio Terrace', 2, 2200, 2, 2, 'age', 6) RETURNING id INTO rt_terrace;
  INSERT INTO public.room_types (hotel_id, name, capacity, base_price, base_occupancy, max_occupancy, child_rule, child_rule_limit)
  VALUES (h, 'Loft Suite', 3, 2800, 2, 3, 'age', 6) RETURNING id INTO rt_loft;

  -- Rooms: 2 + 1 + 1. "Only 1 left" shows for the single-room types.
  INSERT INTO public.rooms (hotel_id, room_type_id, room_number) VALUES
    (h, rt_king, '101'), (h, rt_king, '102'),
    (h, rt_terrace, '201'),
    (h, rt_loft, '301');

  -- Photos: temporary hotlinks to the Stitch preview images (test only). The first is the hero.
  INSERT INTO public.hotel_media (hotel_id, url, caption, is_hero, display_order) VALUES
    (h, 'https://lh3.googleusercontent.com/aida-public/AB6AXuBMbBc8PII0AeeFrt447lFkEuJkBiL_cEsFjsSBc7TpNWuHVihDyOTIZO2a9E2KiqAdtxuLSfIOq-bERtOsjLfQxga8Pohf-z_TuAYB_w8uHQjVArkHXmvYd6z4IXcUgC7KSsPoOZ1Jd0NXrNqt8JhRMxZpBc1WyeT1UXZdqv6fexxYDSSGmnpVKmsj1cEu5HwZ_WBILR8Lrj0V1QIyLZ9CtEmC4795IhCKdWFQfyg', 'Suite', true, 0),
    (h, 'https://lh3.googleusercontent.com/aida-public/AB6AXuCfQn8REGyxFJwnjBQ4YAi5zDPmVkX1NbxAJIZ9d9alJVToobUqFekTYE05Mj2z-aTiaGcbRFRS8ZOlRwmaRF4Pi6Y_VTYIzp2XfvZXtbTTHghMvDnWIYlZKvQJPefyLt9gWCeOp5tKu2E29LT1Bs3BZH7AgbDvfnvPTZF1uY6AH_9vYwlmT0qVixDWo6OiL3e92QBOyCJWkGcb0vtICrevJTJ69mmPaRYpLcOru0M', 'Standard King', false, 1),
    (h, 'https://lh3.googleusercontent.com/aida-public/AB6AXuDKqnFmg8yzIAMy3QqAtKK5VeLWmplZy7VyF01IPrf8mA4C8x_OC4iwRrMRmsUCOWdxeA8Ab6rsDY7BCTmdUOUyMp0kzgGZYX1bwK5woc_5i2QlbBNVAkV65OGO6xdcRRE1dhDDTYG1Q3PFdbvHG0UtWNE6SAzIMDSyu8KGkpFAA86AR5DZSoBrnRy2j6_jq141t-FKalBp-hhHB6XF6c8WEHlzlVrqdj9vJXxZEQ4', 'Studio Terrace', false, 2),
    (h, 'https://lh3.googleusercontent.com/aida-public/AB6AXuBkQEGKHt5qntX9BnY8RV_ox_dmJbB_pRESEr-LCCHvgdtKTKMFksoGzSNZQmr7B-ShQJRRJGUgiLxOvkwh92Is1no5CAzIr8SbvXL4dtVV8GUx8JQwwGtr0KN5RgwMbVT75yOoUF462VqiHwwUEsZ81QEfwfNa_g-SLscwyGbq7zW5rbVuMwp49wfGBVCJQDf8qERSamlu5lrYQIG-x7U7DYBHVng4kUtsgIrEKJA', 'Loft Suite', false, 3),
    (h, 'https://lh3.googleusercontent.com/aida-public/AB6AXuAm0AD-nTmjYK0p2cRQdEdzWtIFQfjj77pVNhUa2zR9SuZ1UYmYtCwX_7awce70nFVDghHFCu_y2FTDaR0y5NUGpVAvibWjX3GxckTPfSdL0Wfj82doefwnh_3PCfDlKqbqR8YZRe_ZIMoSHEFjLlBPJvvPRRh7LFT0j0cbvRRg3an76J06w2Dsiz8vwEyWKZINSLeODQI_DocCLZwssWCmIOlDJks-TzGne7di5SyQCUK07Aes3FfzXWjHuv1W3gCuXxVRuA5emPI', 'Exterior', false, 4);

  INSERT INTO public.hotel_services (hotel_id, name, pricing_model, unit_price, is_active) VALUES
    (h, 'Breakfast', 'PER_PERSON_PER_NIGHT', 150, true),
    (h, 'Airport pickup', 'ONE_TIME', 400, true);

  INSERT INTO public.hotel_site_config (hotel_id, hero_copy, accent_color)
  VALUES (h, 'Six white rooms on a quiet soi off Nimmanhaemin. Concrete, linen, morning light, nothing extra.', NULL);

  INSERT INTO public.hotel_payment_settings (hotel_id, promptpay_id, slipok_enabled)
  VALUES (h, test_promptpay_id, false);

  RAISE NOTICE 'Created hotel test-local (id %). Open /test-local on the test app.', h;
END $$;
