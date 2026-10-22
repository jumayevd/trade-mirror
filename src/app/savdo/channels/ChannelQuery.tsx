"use client";

import { useSearchParams } from "next/navigation";
import ChannelProfileView from "@/components/views/ChannelProfileView";

export default function ChannelQuery() {
  const params = useSearchParams();
  return <ChannelProfileView iso={params.get("iso") ?? ""} cmd={params.get("cmd") ?? ""} />;
}
