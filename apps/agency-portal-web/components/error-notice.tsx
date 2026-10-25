import { errorMessage } from "@/lib/format";

export function ErrorNotice({
  status,
  error,
}: {
  status: number;
  error: { code: string | null; message: string | null } | null;
}) {
  return (
    <p
      role="alert"
      style={{
        padding: 12,
        borderRadius: 8,
        background: "#fef2f2",
        color: "#991b1b",
      }}
    >
      {errorMessage(error, status)}
    </p>
  );
}
