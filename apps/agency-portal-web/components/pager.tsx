export function Pager({
  basePath,
  query,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  query: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    params.set("page", String(target));
    return `${basePath}?${params.toString()}`;
  };
  return (
    <p style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
      <span>
        共 {total} 筆 · 第 {page} / {pages} 頁
      </span>
      {page > 1 ? <a href={href(page - 1)}>上一頁</a> : null}
      {page < pages ? <a href={href(page + 1)}>下一頁</a> : null}
    </p>
  );
}
