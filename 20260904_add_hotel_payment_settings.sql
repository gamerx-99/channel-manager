-- Phase 01: SlipOK per-hotel payment settings
-- BYO-key model: each hotel supplies its own SlipOK API key.
-- Key is stored AES-256 encrypted (app-level); only the sha256 hash is queryable.
-- Run in Supabase SQL editor. Verify with: verify_20260904_add_hotel_payment_settings.sql

CREATE TABLE IF NOT EXISTS hotel_payment_settings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid        NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  -- AES-256 encrypted SlipOK API key (base64-encoded ciphertext + IV)
  -- Format: "<iv_hex>:<ciphertext_base64>"
  slipok_key_enc  text        NULL,
  -- SHA-256 hash of the raw API key for dedup / existence checks without decryption
  slipok_key_hash text        NULL,
  slipok_enabled  boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_payment_settings_hotel_id_unique UNIQUE (hotel_id)
);

-- RLS
ALTER TABLE hotel_payment_settings ENABLE ROW LEVEL SECURITY;

-- Application permissions decide who may manage settings. RLS permits only
-- members/platform readers to reach the selected hotel's row.
CREATE POLICY "hotel_payment_settings_select"
  ON hotel_payment_settings FOR SELECT
  USING (public.is_hotel_member(hotel_id));

-- hotel_owner of that hotel can insert/update their own row
CREATE POLICY "hotel_payment_settings_upsert"
  ON hotel_payment_settings FOR INSERT
  WITH CHECK (public.is_hotel_member(hotel_id));

CREATE POLICY "hotel_payment_settings_update"
  ON hotel_payment_settings FOR UPDATE
  USING (public.is_hotel_member(hotel_id))
  WITH CHECK (public.is_hotel_member(hotel_id));

-- No direct delete via RLS — use the removeSlipOkKey procedure (sets enc/hash to NULL)

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_hotel_payment_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER hotel_payment_settings_updated_at
  BEFORE UPDATE ON hotel_payment_settings
  FOR EACH ROW EXECUTE FUNCTION update_hotel_payment_settings_updated_at();
