import ChannelQuery from "./ChannelQuery";

export const metadata = { title: "Channel profile — Mirror Trade Analytics" };

/**
 * One page for every country × HS6 channel, addressed by query
 * (`/savdo/channels?iso=chn&cmd=870323`). There are thousands of channels — far more
 * than can be prerendered — and the profile is computed client-side from the
 * bundled dataset anyway, so a single static shell serves them all.
 */
export default function ChannelPage() {
  return <ChannelQuery />;
}
