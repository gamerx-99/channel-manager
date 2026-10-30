import React from "react";
import { trpc } from "@/lib/trpc";

export default function PlatformOverview() {
  const query = trpc.access.platformSummary.useQuery();
  return <div className="page-content"><h1>Platform overview</h1>
    {query.isLoading && <p role="status">Loading platform summary…</p>}
    {query.error && <p role="alert">{query.error.message}<button type="button" onClick={() => void query.refetch()}>Retry</button></p>}
    <section className="panel"><table className="data-table"><thead><tr><th>Hotel</th><th>Plan</th><th>Payment status</th><th>Rooms</th><th>Sync status</th></tr></thead>
      <tbody>{query.data?.map((hotel, index) => <tr key={index}><td>{hotel.hotelName}</td><td>{hotel.plan ?? "Unavailable"}</td><td>{hotel.paymentStatus ?? "Unavailable"}</td><td>{hotel.roomCount}</td><td>{hotel.syncStatus}</td></tr>)}</tbody>
    </table></section>
  </div>;
}
