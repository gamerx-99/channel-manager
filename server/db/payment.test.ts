import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getHotelPaymentConfig, getSlipOkCredentialsForVerification } from "./payment";

function paymentSettingsClient() {
  const selects: string[] = [];
  const filters: Array<[string, unknown, unknown]> = [];
  const client = {
    from(table: string) {
      expect(table).toBe("hotel_payment_settings");
      let columns = "";
      const query = {
        select(value: string) { columns = value; selects.push(value); return query; },
        eq(column: string, value: unknown) { filters.push([columns, column, value]); return query; },
        async maybeSingle() {
          if (columns === "promptpay_id,slipok_enabled,payment_timeout_minutes") {
            return { data: { promptpay_id: "prompt", slipok_enabled: true, payment_timeout_minutes: 25 }, error: null };
          }
          return { data: { slipok_key_enc: "SENTINEL_ENC_KEY", slipok_branch_id: "SENTINEL_BRANCH" }, error: null };
        },
      };
      return query;
    },
  };
  return { client: client as unknown as SupabaseClient, selects, filters };
}

describe("Supabase payment config secret boundary", () => {
  it("selects and returns only client-safe payment settings", async () => {
    const { client, selects } = paymentSettingsClient();
    const config = await getHotelPaymentConfig(client, "hotel-a");
    expect(selects).toEqual(["promptpay_id,slipok_enabled,payment_timeout_minutes"]);
    expect(config).toEqual({ promptpay_id: "prompt", slipok_enabled: true, payment_timeout_minutes: 25 });
    expect(Object.keys(config!).sort()).toEqual(["payment_timeout_minutes", "promptpay_id", "slipok_enabled"]);
  });

  it("selects only credentials, and filters to enabled SlipOK settings", async () => {
    const { client, selects, filters } = paymentSettingsClient();
    await expect(getSlipOkCredentialsForVerification(client, "hotel-a")).resolves.toEqual({
      slipok_key_enc: "SENTINEL_ENC_KEY", slipok_branch_id: "SENTINEL_BRANCH",
    });
    expect(selects).toEqual(["slipok_key_enc,slipok_branch_id"]);
    expect(filters).toEqual([
      ["slipok_key_enc,slipok_branch_id", "hotel_id", "hotel-a"],
      ["slipok_key_enc,slipok_branch_id", "slipok_enabled", true],
    ]);
  });
});
