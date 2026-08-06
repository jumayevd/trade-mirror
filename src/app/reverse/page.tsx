import ReverseView from "@/components/views/ReverseView";

export const metadata = {
  title: "Reverse Discrepancies — Trade Mirror",
  description:
    "Channels where Uzbekistan's import records exceed partner-reported exports — analysed separately from positive discrepancies, with neutral explanations first.",
};

export default function ReversePage() {
  return <ReverseView />;
}
