# SD-DP-20260820-012 Phase 1 Regulatory Output Scope

## Decision Record

- `decision_id`: `SD-DP-20260820-012`
- `title`: `Phase 1 generates no filing artifacts and answers regulator access through staff-mediated export`
- `owner`: `Claude / Q-005 follow-up`
- `date`: `2026-08-20`
- `status`: `accepted`
- `approval`:
  - accepted by the repository owner on 2026-08-20, on two statements: the 立案 application has
    already been filed externally, and staff-mediated export is considered sufficient for the
    公路主管機關 access obligation
- `affected_docs`:
  - `phase1_prd_detailed_v1.md` section `9.10.2`
- `superseding_decision`:
  - PRD 9.10.2's PDF main report and ZIP attachment package are **not built in Phase 1**. The
    registration they were for has been filed by other means
  - the filing-package surface stays as it is: a manifest, a checksum over that manifest, and a
    controlled signed download reference. It is metadata about a package, not a package
  - 汽車運輸業管理規則 §91(4)'s requirement to give 公路主管機關 query and download access is
    answered in Phase 1 by platform staff exporting on the authority's behalf. No regulator realm
    is introduced
  - Object Lock for filing artifacts (`PHASE1_OPEN_QUESTIONS.md` Q-005) is therefore moot rather
    than deferred: there is no artifact to lock
- `scope`:
  - `phase1_prd_detailed_v1.md` section `9.10.2`
  - `Q-005` in `PHASE1_OPEN_QUESTIONS.md`
  - the §9.10.2 line in the 2026-08-17 conformance audit
- `out_of_scope`:
  - PRD 9.10.1's nine regulatory reports, which are a separate section and a separate question
  - retention periods, settled by `COMP-RETENTION-001` on the same day
  - `admin.phase1_filing_packages` database-level immutability, which protects the rows that do
    exist and is unaffected by this decision
- `implementation_implications`:
  - no code changes. The metadata-only surface is ratified, not repaired
  - the artifact URL fields point at `https://downloads.drts.local`, a host that does not resolve,
    and nothing serves that path. Under this decision that is not a defect, but it is a trap for
    any caller that assumes a URL field means a retrievable file
- `completion_bar`:
  - PRD 9.10.2 states plainly that Phase 1 does not generate the artifacts it describes
  - Q-005 is closed as moot with the reason recorded
  - the conformance audit's §9.10.2 line no longer reports the section as conformant

## Problem

The 2026-08-17 conformance audit recorded PRD 9.10.2 as aligned, citing the
`filing-packages/generate` endpoint and a manifest carrying `manifestHash`, `checksum`, and
`immutable: true`.

That assessment checked the API surface and the data structure and did not check whether any bytes
were produced. They are not:

- `reporting-filing` contains no `writeFile`, no `createWriteStream`, and no `Buffer` construction
- `apps/api` contains no GCS, S3, or equivalent client
- `DEFAULT_CONTROLLED_DOWNLOAD_HOST` is `https://downloads.drts.local`, which does not resolve, and
  no controller serves that path
- the `checksum` is `computeHash({ packageId, packageType, entries })` -- a hash of the manifest
  listing, not of any file content

So the package has a manifest, a checksum over that manifest, an immutability flag, and two URLs
that lead nowhere. PRD 9.10.2 asks for a PDF main report and a ZIP attachment package containing
equipment, premises, operating method, staffing, branding, disclosure, and supplier evidence. None
of that is produced.

## Decision

Do not build it. The registration these artifacts were for has already been filed externally, so
the generator would be work for a deadline that has passed.

The metadata surface stays. It records that a package was requested, what it would contain, and
that the listing has not been altered since -- which is useful on its own and is what the audit
trail actually references.

## Regulator access

§91(4) requires more than retention: 「配合公路主管機關提供查詢及下載之權限」.

The platform has `regulatory:read` and `regulatory:write` scopes and a regulator-case export
surface, but that controller is `@RequireRealms("platform")`. There is no regulator realm, so an
authority cannot query directly; platform staff export on its behalf.

The operator's position, recorded here as theirs, is that staff-mediated export satisfies the
obligation. This is a compliance judgement rather than a legal opinion, and it is worth stating the
counter-reading once so the record is honest: the article says provide the _permission_ to query and
download, which can be read as the authority holding that permission rather than exercising it
through an intermediary. If a regulator takes that reading, the fix is a regulator realm scoped to
that authority's own cases, and this decision is the place to revisit.

## What this does not settle

PRD 9.10.1's nine regulatory reports -- vehicle roster, driver roster, contract roster, insurance
roster, monthly vehicle change report, six-month statistics, fee-schedule version history, complaint
detail, and dispatch records with recording index -- produce no bytes either. §91 imposes no
periodic submission obligation, so unlike the filing package there is no deadline that made them
urgent, and unlike the filing package nobody has said they are unnecessary. That is a separate
question and is left open.
