// Credential-only interpretation of the API's pg-connection-string URL rules.
// Use Node's WHATWG URL (including pg's empty-host fallback), not Python's
// authority parser, which interprets brackets in passwords as IPv6 syntax.
// Never connect, honor URL host/options, or load SSL files in this helper.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function credentials(secret) {
  if (/[\r\n\0]/.test(secret)) throw new Error("invalid_db_secret");
  // Match pg-connection-string's treatment of spaces and literal percent signs.
  const normalized = / |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(secret)
    ? encodeURI(secret).replace(/%25(\d\d)/g, "%$1")
    : secret;
  let url;
  try {
    url = new URL(normalized);
  } catch {
    url = new URL(normalized.replace("@/", "@___DUMMY___/"));
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("invalid_db_secret");
  }
  const query = Object.fromEntries(url.searchParams);
  const result = {
    user: query.user || decodeURIComponent(url.username),
    password: query.password || decodeURIComponent(url.password),
    database: decodeURI(url.pathname.slice(1)),
  };
  if (Object.values(result).some((value) => !value || /[\r\n\0]/.test(value))) {
    throw new Error("invalid_db_secret");
  }
  return result;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    // stdin/stdout are private pipes owned by Readback, never runner logs.
    process.stdout.write(JSON.stringify(credentials(readFileSync(0, "utf8"))));
  } catch {
    process.stderr.write("invalid_db_secret\n");
    process.exitCode = 1;
  }
}
