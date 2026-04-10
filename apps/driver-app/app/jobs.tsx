import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function JobsScreen() {
  return (
    <PlaceholderScreen
      title="Jobs Inbox"
      description="Placeholder inbox for assigned jobs and trip handoffs. Real dispatch state management is not implemented during bootstrap."
      nextHref="/trip"
      nextLabel="Open Trip"
    />
  );
}
