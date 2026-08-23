import type { ChannelPerformanceChannel } from "@/../../server/channelPerformance";

export type ChannelFilter = "all" | "booking" | "ota" | "issues";

export function filterChannelPerformanceChannels(
  channels: readonly ChannelPerformanceChannel[],
  search: string,
  filter: ChannelFilter,
) {
  const normalizedSearch = search.trim().toLowerCase();
  return channels.filter((channel) => {
    const matchesSearch = !normalizedSearch || channel.label.toLowerCase().includes(normalizedSearch);
    const matchesFilter = filter === "all"
      || (filter === "issues" && channel.kind === "ota" && channel.syncStatus !== "healthy")
      || channel.kind === filter;
    return matchesSearch && matchesFilter;
  });
}
