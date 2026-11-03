"use client";

import { useState, type CSSProperties } from "react";
import { AGENCY_ACCESS_LOG_ACTIONS } from "@drts/contracts";
import {
  Badge,
  Card,
  CardBody,
  DataTable,
  PageHeader,
  Td,
  Tr,
} from "@drts/ui-web";

import { formatDateTime, useAsyncData } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";

import { listAccessLogs } from "../agency-admin-api";

const pageStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const OUTCOME_VARIANT = {
  success: "green",
  denied: "red",
  error: "orange",
} as const;

export default function AgencyAccessLogsPage() {
  const { t } = useTranslation();
  const [agencyId, setAgencyId] = useState("");
  const [principalId, setPrincipalId] = useState("");
  const [action, setAction] = useState("");
  const [query, setQuery] = useState<Record<string, string | undefined>>({
    page: "1",
  });
  const { data, loading, error } = useAsyncData(
    (client) => listAccessLogs(client, query),
    [JSON.stringify(query)],
  );
  const page = data?.page ?? 1;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div style={pageStyle}>
      <PageHeader
        title={t("agencies.logs.title")}
        subtitle={t("agencies.logs.subtitle")}
        actions={<a href="/agencies">{t("agencies.detail.back")}</a>}
      />
      <Card>
        <CardBody>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setQuery({
                agencyId: agencyId || undefined,
                principalId: principalId || undefined,
                action: action || undefined,
                page: "1",
              });
            }}
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "end",
            }}
          >
            <label>
              {t("agencies.logs.filterAgency")}
              <br />
              <input
                value={agencyId}
                onChange={(event) => setAgencyId(event.target.value)}
                aria-label={t("agencies.logs.filterAgency")}
              />
            </label>
            <label>
              {t("agencies.logs.filterPrincipal")}
              <br />
              <input
                value={principalId}
                onChange={(event) => setPrincipalId(event.target.value)}
                aria-label={t("agencies.logs.filterPrincipal")}
              />
            </label>
            <label>
              {t("agencies.logs.filterAction")}
              <br />
              <select
                value={action}
                onChange={(event) => setAction(event.target.value)}
                aria-label={t("agencies.logs.filterAction")}
              >
                <option value="">{t("agencies.logs.filterAll")}</option>
                {AGENCY_ACCESS_LOG_ACTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">{t("agencies.logs.search")}</button>
          </form>
        </CardBody>
      </Card>
      <Card>
        {loading ? (
          <CardBody>{t("agencies.loading")}</CardBody>
        ) : error ? (
          <CardBody>
            <p role="alert">{t("agencies.error", { message: error })}</p>
          </CardBody>
        ) : (
          <>
            <DataTable
              columns={[
                { label: t("agencies.logs.time") },
                { label: t("agencies.logs.agency") },
                { label: t("agencies.logs.principal") },
                { label: t("agencies.logs.action") },
                { label: t("agencies.logs.resource") },
                { label: t("agencies.logs.rows") },
                { label: t("agencies.logs.outcome") },
                { label: t("agencies.logs.reason") },
                { label: t("agencies.logs.filter") },
              ]}
              minWidth={1200}
              empty={t("agencies.logs.empty")}
            >
              {(data?.items ?? []).map((record) => (
                <Tr key={record.accessId}>
                  <Td>{formatDateTime(record.occurredAt)}</Td>
                  <Td mono>{record.agencyId}</Td>
                  <Td mono>{record.principalId}</Td>
                  <Td mono>{record.action}</Td>
                  <Td mono>{record.resourceId ?? record.resourceType}</Td>
                  <Td>{record.rowCount ?? t("agencies.notProvided")}</Td>
                  <Td>
                    <Badge variant={OUTCOME_VARIANT[record.outcome]}>
                      {record.outcome}
                    </Badge>
                  </Td>
                  <Td mono>{record.reasonCode ?? ""}</Td>
                  <Td mono>{JSON.stringify(record.filter)}</Td>
                </Tr>
              ))}
            </DataTable>
            <CardBody>
              {t("agencies.logs.page", {
                page,
                pages,
                total: data?.total ?? 0,
              })}{" "}
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setQuery({ ...query, page: String(page - 1) })}
              >
                {t("agencies.logs.prev")}
              </button>{" "}
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setQuery({ ...query, page: String(page + 1) })}
              >
                {t("agencies.logs.next")}
              </button>
            </CardBody>
          </>
        )}
      </Card>
    </div>
  );
}
