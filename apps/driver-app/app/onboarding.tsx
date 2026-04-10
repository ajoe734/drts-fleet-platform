import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function OnboardingScreen() {
  return (
    <PlaceholderScreen
      title="Onboarding"
      description="Placeholder onboarding shell for drivers and safety operators. Identity checks, training gates, and provisioning rules are deferred."
      nextHref="/jobs"
      nextLabel="Go to Jobs"
    />
  );
}
