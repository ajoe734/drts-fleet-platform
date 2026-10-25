import type { AgencyPage, AgencyTripRecordView } from "@drts/contracts";
import { Card, DataTable, PageHeader, Td, Tr } from "@drts/ui-web";

import { ErrorNotice } from "@/components/error-notice";
import { Pager } from "@/components/pager";
import { PortalShell } from "@/components/portal-shell";
import { PrgMask } from "@/components/prg-mask";
import { display, displayDateTime, displayMinor } from "@/lib/format";
import {
  firstParam,
  loadAgencyData,
  readAgencyProfile,
} from "@/lib/session.server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const LEGAL_HOLD_LABELS: Record<string, string> = {
  active: "保全中",
  none: "無",
  unavailable: "未提供",
};

export default async function TripRecordsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = {
    month: firstParam(params.month),
    reservedFrom: firstParam(params.reservedFrom),
    reservedTo: firstParam(params.reservedTo),
    legalHold: firstParam(params.legalHold),
    page: firstParam(params.page),
    pageSize: firstParam(params.pageSize),
  };
  const result = await loadAgencyData<AgencyPage<AgencyTripRecordView>>(
    "/trip-records",
    ["trip-records"],
    query,
  );
  const profile = await readAgencyProfile();
  return (
    <PortalShell agencyName={profile?.agencyDisplayName ?? null}>
      <PageHeader
        title="R11 行程紀錄"
        subtitle="法定最低保存期間：各趟次至少二年。僅顯示仍在保存期間內的紀錄。"
      />
      <form
        method="get"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}
      >
        <label>
          月份{" "}
          <input
            name="month"
            placeholder="YYYY-MM"
            defaultValue={query.month ?? ""}
          />
        </label>
        <label>
          預約日起{" "}
          <input
            name="reservedFrom"
            type="date"
            defaultValue={query.reservedFrom ?? ""}
          />
        </label>
        <label>
          預約日迄{" "}
          <input
            name="reservedTo"
            type="date"
            defaultValue={query.reservedTo ?? ""}
          />
        </label>
        <label>
          法律保全
          <select name="legalHold" defaultValue={query.legalHold ?? "all"}>
            <option value="all">全部</option>
            <option value="active">保全中</option>
            <option value="none">無</option>
          </select>
        </label>
        <button type="submit">查詢</button>
      </form>
      {result.data ? (
        <Card>
          <DataTable
            columns={[
              { label: "訂單編號" },
              { label: "車號" },
              { label: "預約時間" },
              { label: "上車" },
              { label: "下車" },
              { label: "里程（公尺）" },
              { label: "應付車資" },
              { label: "實收車資" },
              { label: "保存至" },
              { label: "法律保全" },
            ]}
            empty="查無資料"
          >
            {result.data.items.map((record) => (
              <Tr key={record.recordId}>
                <Td mono>
                  <a
                    href={`/trip-records/${encodeURIComponent(record.recordId)}`}
                  >
                    {display(record.orderNoMasked)}
                  </a>
                </Td>
                <Td mono>
                  {display(record.plateNoMasked)} <PrgMask />
                </Td>
                <Td>{displayDateTime(record.reservedAt)}</Td>
                <Td>{displayDateTime(record.pickupAt)}</Td>
                <Td>{displayDateTime(record.dropoffAt)}</Td>
                <Td>{display(record.route.distanceMeters)}</Td>
                <Td>
                  {displayMinor(record.payableFareMinor, record.currency)}
                </Td>
                <Td>{displayMinor(record.actualFareMinor, record.currency)}</Td>
                <Td>{displayDateTime(record.retainUntil)}</Td>
                <Td>
                  {LEGAL_HOLD_LABELS[record.legalHold.state] ?? display(null)}
                </Td>
              </Tr>
            ))}
          </DataTable>
          <div style={{ padding: "0 16px" }}>
            <Pager
              basePath="/trip-records"
              query={query}
              page={result.data.page}
              pageSize={result.data.pageSize}
              total={result.data.total}
            />
          </div>
        </Card>
      ) : (
        <ErrorNotice status={result.status} error={result.error} />
      )}
    </PortalShell>
  );
}
