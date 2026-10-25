"use client";

import { useState, type CSSProperties } from "react";
import type { RegulatoryAgencyRecord } from "@drts/contracts";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  PageHeader,
  Td,
  Tr,
} from "@drts/ui-web";

import {
  formatDateTime,
  useAsyncData,
  usePlatformAdminClient,
} from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";

import { createAgency, listAgencies } from "./agency-admin-api";

const pageStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const STATUS_VARIANT = {
  active: "green",
  suspended: "red",
  retired: "gray",
} as const;

export default function AgenciesPage() {
  const { t } = useTranslation();
  const client = usePlatformAdminClient();
  const { data, loading, error, refresh } = useAsyncData(
    (apiClient) => listAgencies(apiClient),
    [],
  );
  const [agencyCode, setAgencyCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const agencies: RegulatoryAgencyRecord[] = data ?? [];

  return (
    <div style={pageStyle}>
      <PageHeader
        title={t("agencies.title")}
        subtitle={t("agencies.subtitle")}
        actions={
          <a href="/agencies/access-logs">{t("agencies.accessLogsLink")}</a>
        }
      />
      <Card>
        <CardHeader>{t("agencies.create.title")}</CardHeader>
        <CardBody>
          <p style={{ marginTop: 0 }}>{t("agencies.create.note")}</p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setSubmitting(true);
              setActionError(null);
              try {
                await createAgency(client, { agencyCode, displayName });
                setAgencyCode("");
                setDisplayName("");
                await refresh();
              } catch (e) {
                setActionError(e instanceof Error ? e.message : String(e));
              } finally {
                setSubmitting(false);
              }
            }}
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "end",
            }}
          >
            <label>
              {t("agencies.create.code")}
              <br />
              <input
                required
                value={agencyCode}
                onChange={(event) => setAgencyCode(event.target.value)}
                aria-label={t("agencies.create.code")}
              />
            </label>
            <label>
              {t("agencies.create.name")}
              <br />
              <input
                required
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                aria-label={t("agencies.create.name")}
              />
            </label>
            <button type="submit" disabled={submitting}>
              {t("agencies.create.submit")}
            </button>
          </form>
          {actionError ? (
            <p role="alert">{t("agencies.error", { message: actionError })}</p>
          ) : null}
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
          <DataTable
            columns={[
              { label: t("agencies.col.code") },
              { label: t("agencies.col.name") },
              { label: t("agencies.col.status") },
              { label: t("agencies.col.created") },
              { label: t("agencies.col.actions") },
            ]}
            empty={t("agencies.list.empty")}
          >
            {agencies.map((agency) => (
              <Tr key={agency.agencyId}>
                <Td mono>{agency.agencyCode}</Td>
                <Td>{agency.displayName}</Td>
                <Td>
                  <Badge variant={STATUS_VARIANT[agency.status]}>
                    {t(`agencies.status.${agency.status}`)}
                  </Badge>
                </Td>
                <Td>{formatDateTime(agency.createdAt)}</Td>
                <Td>
                  <a href={`/agencies/${encodeURIComponent(agency.agencyId)}`}>
                    {t("agencies.open")}
                  </a>
                </Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}
