import { routeDriverActivationLink } from "@/lib/driver-activation-link";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  return routeDriverActivationLink(path);
}
