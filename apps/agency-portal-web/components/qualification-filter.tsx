export function QualificationFilter({
  status,
  windowDays,
}: {
  status: string | undefined;
  windowDays: string | undefined;
}) {
  return (
    <form method="get" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
      <label>
        到期狀態
        <select name="status" defaultValue={status ?? ""}>
          <option value="">全部</option>
          <option value="expired">已過期</option>
          <option value="expiring">即將到期</option>
          <option value="valid">有效</option>
          <option value="unavailable">未提供</option>
        </select>
      </label>
      <label>
        到期預警天數（0–365）
        <input
          name="windowDays"
          type="number"
          min={0}
          max={365}
          defaultValue={windowDays ?? "30"}
        />
      </label>
      <button type="submit">查詢</button>
    </form>
  );
}
