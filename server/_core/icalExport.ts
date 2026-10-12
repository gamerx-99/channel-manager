import type { Express, Request, Response } from "express";
import { createSupabaseAdminClient } from "../supabase";
import { buildOtaIcalFeed } from "../otaSync";
import { listOwnBookingNights } from "../db/otaBlocks";

/**
 * Outbound iCal feed (Property -> OTA).
 *
 * Per-hotel .ics feed of the property's own bookings that occupy sellable
 * inventory (direct + staff-created stays). The OTA subscribes to this feed
 * and closes the matching dates on its side, which is what prevents the OTA
 * from selling a room the property already sold directly. Access is granted
 * by an unguessable per-hotel token that lives only in `ota_connections`
 * (RLS-guarded, hotel-membership based), so raw hotel ids are never exposed.
 *
 * Route: GET /api/ical/:hotelId.ics?token=<ical_feed_token>
 */

function getIcalToken(req: Request): string | null {
  const raw = req.query.token;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function registerIcalExportRoutes(app: Express) {
  app.get("/api/ical/:hotelId.ics", async (req: Request, res: Response) => {
    const hotelId = typeof req.params.hotelId === "string" ? req.params.hotelId : "";
    const token = getIcalToken(req);

    if (!hotelId || !token) {
      res.status(401).json({ error: "A valid iCal feed token is required." });
      return;
    }

    try {
      const adminClient = createSupabaseAdminClient();
      // A hotel may have several OTA connections; the feed token is shared
      // per hotel (see enforce_single_ical_feed_token), so match the token
      // first and never fail on multi-row results.
      const { data: connections, error } = await adminClient
        .from("ota_connections")
        .select("hotel_id,status,ical_feed_token")
        .eq("hotel_id", hotelId);

      if (error || !connections || connections.length === 0) {
        res.status(404).json({ error: "iCal feed not found." });
        return;
      }

      const connection = connections.find((row) => row.ical_feed_token === token);
      if (!connection) {
        res.status(403).json({ error: "Invalid iCal feed token." });
        return;
      }

      const { data: hotel, error: hotelError } = await adminClient
        .from("hotels")
        .select("name")
        .eq("id", hotelId)
        .maybeSingle();

      const calendarName = hotel?.name || "Property availability";
      // Outbound = the property's OWN bookings (direct + staff-created).
      // Imported OTA blocks are intentionally NOT re-exported: sending them
      // back would close dates the OTA already knows about and hide nothing
      // new, while the OTA would keep selling rooms the property sold direct.
      const ownNights = await listOwnBookingNights(adminClient, hotelId);
      const feed = buildOtaIcalFeed(
        ownNights.map(night => ({
          hotel_id: night.hotel_id,
          room_type_id: night.room_type_id,
          date: night.date,
        })),
        { calendarName, hotelId },
      );

      if (hotelError) {
        console.warn("[iCal Export] Failed to load hotel name, using fallback", hotelError);
      }

      res.status(200).set({
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${hotelId}.ics"`,
        "Cache-Control": "no-store",
      });
      res.send(feed);
    } catch (error) {
      console.error("[iCal Export] Failed to build feed", error);
      res.status(500).json({ error: "Failed to generate iCal feed." });
    }
  });
}
