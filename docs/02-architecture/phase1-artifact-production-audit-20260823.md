# Phase 1 Artifact Production Audit (2026-08-23)

**Method:** for every surface that is supposed to hand something to somebody outside the
system, ask whether executing it produces content — not whether an endpoint, a type, or a
URL field exists.

**Why this method:** the 2026-08-17 conformance audit compared the PRD and the service
contracts to the code line by line and concluded "substantially conformant". It was wrong
twice, in the same way both times. It recorded PRD 9.10.2 as conformant because the
endpoint and the manifest existed, without asking whether a PDF was produced. And it never
covered PRD 9.10.1 at all, while eight of nine regulatory reports returned a `completed`
job with zero rows. Checking that an interface exists cannot find a defect whose whole
shape is an interface with nothing behind it.

**Scope:** reports, exports, filing packages, certificates, statements, disclosure
artifacts, attachments. Notifications and external provider calls are excluded — those are
gated by recorded decisions (`EXT-001`, `EXT-002`, `EXT-004`).

---

## 1. Conclusion

The platform produces real artifacts in three places and offers signed download links to
nothing in five.

There is one defect, and it has one cause: `createControlledDownloadMetadata` mints a
signed URL at `DEFAULT_CONTROLLED_DOWNLOAD_HOST`, which is `https://downloads.drts.local`.
That host does not resolve, and no controller in the repository serves that path. Five
modules call it. Every artifact they describe is a reference to a file that was never
written.

This is not a missing feature per module. It is one missing layer that five modules were
written as though they had.

---

## 2. Surfaces that produce real content

| Surface                             | Output         | Mechanism                                                                                                                                   |
| ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `certificate-support`               | HTML and PDF   | `certificate-artifact.renderer.ts` builds real PDF stream objects; served as `StreamableFile` with content type and filename                |
| `tenant-partner` referral statement | CSV            | `renderReferralStatementArtifact`, served as `StreamableFile`; escapes leading `=+-@` so a partner's spreadsheet does not execute the cells |
| `driver-sos` attachments            | object storage | `@aws-sdk/client-s3` via `S3DriverSosAttachmentStorageAdapter`                                                                              |

These matter beyond themselves: they establish that the codebase can render CSV, can render
PDF, and can talk to an object store. The reports do not fail for want of a technique.

One qualification on the third: the adapter is env-gated on `DRIVER_SOS_S3_BUCKET`, and the
factory returns `undefined` when it is unset. Dev sets none of the `DRIVER_SOS_S3_*`
variables, so in the running dev environment there is no object storage. The capability is
in the code, not in the environment.

---

## 3. Surfaces that offer a link to nothing

All five resolve `host` to the same `DEFAULT_CONTROLLED_DOWNLOAD_HOST`.

| Module                   | What it describes                     |
| ------------------------ | ------------------------------------- |
| `reporting-filing`       | report job artifacts, filing packages |
| `billing-settlement`     | settlement statements, invoices       |
| `regulatory-reporting`   | Phase 2 regulatory report jobs        |
| `accident-investigation` | investigation packets                 |
| `platform-admin`         | placard artifacts                     |

`createArtifact` shows the shape:

```ts
const manifestHash = this.computeHash(payload);
// ...
downloadUrl: downloadMetadata.downloadUrl,
manifestHash,
immutable: true,
```

The hash is over the in-memory payload object, not over any file. `immutable: true` is a
literal. The response carries `artifactId`, `downloadUrl`, `expiresAt`, `manifestHash` and
an expiry — every attribute of a controlled download except the download.

---

## 4. What this means for the nine regulatory reports

`REG-RPT-001` through `004` (merged 2026-08-21) made all nine of PRD 9.10.1 produce rows.
That work is real and this audit does not walk it back: `GET /reports/{jobId}` returns the
rows, and the row counts track their sources.

Two things it did not do, which were not visible while the reports were empty:

**The artifact is still a dead link.** Every completed report references
`https://downloads.drts.local/...`. A caller who follows the field the API gives them gets
nothing.

**`format` selects nothing.** `CreateReportJobCommand.format` accepts `csv | xlsx | pdf |
zip`, and the value is copied into the job record, the artifact payload and the view. It
never reaches a renderer. A job requested as `pdf` and a job requested as `csv` produce
byte-identical results, which is to say no bytes at all.

So the accurate statement about PRD 9.10.1 is: **the data is now computed, and it is
readable through the API. It is not exportable.** For a regulator-facing report that
distinction is the whole point of the section, and the previous statement in the closing
notes — that all nine "produce rows" — is true but narrower than it sounded.

---

## 5. What is not a defect

Returning data in an API response is a real output. `regulator case export`, `complaint
export view`, `passenger receipt` and the multi-taxi trip export return JSON to their
callers and reference no download; they are complete as designed.

PRD 9.10.2's filing package is decided, not broken (`SD-DP-20260820-012`): Phase 1 does not
build the generator because the 立案 registration was filed by other means.

One correction to that decision's reasoning, which does not change its conclusion.
`SD-DP-20260820-012` states that "`apps/api` contains no GCS, S3, or equivalent client".
That was already untrue when written: `@aws-sdk/client-s3` has been a dependency since
`E2E-MTX-RELEASE-GAPS-001` on 2026-07-24, with a working adapter. The decision's outcome
stands — there is no artifact to store — but the premise about the platform's capability
was wrong, and it is the kind of premise a future decision would lean on.

---

## 6. Remediation

The order matters, because the second step is cheap only after the first.

1. **Stop advertising a download that does not exist.** Either omit `downloadUrl` and
   `expiresAt` when no file was written, or return a URL that resolves to a route which
   responds with an explicit "no artifact" error. A field that names a file is a promise;
   five modules are making it and none can keep it.
2. **Render.** The renderers exist. `renderReferralStatementArtifact` is a working CSV
   writer and `certificate-artifact.renderer.ts` is a working PDF writer, both in this
   repository, both streaming through `StreamableFile`. Wiring `format` to a renderer and
   streaming the result is the smallest change that makes an export an export.
3. **Only then consider storage.** A streamed response covers a person clicking export. An
   object store is needed for an artifact that must outlive the request, be re-fetched, or
   be retention-locked — which is a different requirement, and `SD-DP-20260820-012` already
   settled that Phase 1 does not have it for filing packages.

Steps 1 and 2 need no infrastructure and no new dependency.

---

## 6a. Status, 2026-08-23

Steps 1 and 2 are done.

**Step 2, reports (`AUDIT-ARTIFACT-002`).** `format` is a renderer registry with the
same compile-time guard as the row builders; csv renders and xlsx, pdf and zip are
rejected at creation rather than producing a completed job and no file.
`GET /reports/:jobId/artifact` streams the rendered file under the same access checks
`getReportJob` applies, and `artifact.downloadUrl` addresses it. The CSV writer moved to
`common/csv.ts` rather than being written a second time, taking with it the rule that a
cell beginning `=`, `+`, `-` or `@` is quote-prefixed so a spreadsheet does not execute it.

**Step 1, the other four (`AUDIT-ARTIFACT-003`).** `DEFAULT_CONTROLLED_DOWNLOAD_HOST` is
now `/downloads`, a relative prefix on the API's own origin, and
`ControlledDownloadController` answers it: `501 ARTIFACT_NOT_MATERIALISED` naming the kind,
`410` for an expired link, `400` for one with no signature, and a pointer to
`GET /reports/{jobId}/artifact` when the kind is `report`. The link still yields no file,
which is the truth; it no longer yields a DNS error, which was not.

One thing that route deliberately does not do is verify the signature. The signature covers
`manifestHash`, and the URL does not carry it, so **a controlled-download link cannot be
verified from itself.** Every link the platform has ever issued has been unverifiable.
Adding `manifest_hash` to the query is the prerequisite for serving anything from that
route, and it is not done here.

Step 3, storage, remains untouched and unneeded for anything currently in scope.

Two knock-on notes. `phase1_prd_detailed_v1.md` section 9.10.2 describes the artifact URL
fields as pointing at `https://downloads.drts.local`; that sentence is now stale, and it is
L1, so it is left for a controlled revision rather than edited here
(`SD-DP-20260422-003`). And the `format` guard turned up five more tests passing a value
`ReportOutputFormat` has never had -- the third such class this week, after two invented
job types.

---

## 7. Traceability

| Finding                                                              | Severity | Nature                                 |
| -------------------------------------------------------------------- | -------- | -------------------------------------- |
| Five modules issue signed URLs at a non-resolving host with no route | P1       | one missing layer, five callers        |
| `ReportOutputFormat` accepts four formats and selects none           | P1       | contract accepts input it ignores      |
| `manifestHash` hashes a payload object, not a file                   | P2       | integrity claim over the wrong thing   |
| `SD-DP-20260820-012` asserts no object-store client exists           | P3       | wrong premise, conclusion unaffected   |
| `driver-sos` S3 unconfigured in dev                                  | P3       | capability present, environment absent |
