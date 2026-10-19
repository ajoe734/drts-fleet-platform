// Reuse the narrow Driver transport, including its original device JWT and
// separate upstream runtime identity. The Ops control-plane proxy is unrelated.
export {
  GET,
  POST,
  PATCH,
  PUT,
  DELETE,
} from "../../../../../passenger-app-web/app/api/review-driver-api/[...path]/route";

export const dynamic = "force-dynamic";
