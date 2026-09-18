# Phase 1 Money Path Audit (2026-08-23)

**Method:** follow an amount from where it is quoted to where it is paid, settled,
invoiced and printed, and ask at each hop whether it still means the same thing. Not
whether the endpoint exists — the artifact audit already covers that class — but whether
the arithmetic and the units survive the journey.

**Scope:** fares, revenue share, settlement statements, tenant invoices, driver payouts,
platform earnings, and the electronic certificate a passenger receives.

---

## 1. Conclusion

The arithmetic is sound. The units are not.

Money is held in minor units as integers, never as floats. Percentages are basis points.
Rounding happens once per line, half-up, and every total in the system is the sum of its
already-rounded lines rather than a second independent calculation — so there is no
penny drift between a statement's total and the rows that make it up.

What is wrong is the currency label. **The same currency is written two ways.** Twenty-seven
places say `NTD`; fourteen say `TWD`. `TWD` is the ISO 4217 code for the New Taiwan Dollar.
`NTD` is a colloquial abbreviation and is not an ISO code. Four places treat `NTD` as a
validation constant and reject anything else, and one of those rejections silently disables
a regulator-facing artifact.

Nothing is mispaying anyone today. The two halves have not met.

---

## 2. What holds up

| Property                                                     | Where                                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Integer minor units throughout; no float arithmetic on money | `MoneyAmount.amountMinor`, and `Number(row.amount_minor)` only converts a database numeric            |
| Rates as basis points, not decimals                          | `calculateLineShareAmountMinor`: `Math.round((amountMinor * rateBps) / 10000)`                        |
| Totals derived from lines, never recomputed                  | `shareTotal = sumMoney(lines.map(l => l.shareAmount))`; `amount = sumMoney(lines.map(l => l.amount))` |

The third is the one worth naming, because it is the difference between an invoice that
foots and one that does not. Rounding per line and then summing gives a total that always
equals the printed rows. Rounding the sum instead would have produced statements whose
lines do not add up to their own total, which is the classic way a settlement report loses
an argument with a partner.

---

## 3. Finding: one currency, two codes

```
"NTD"  27 occurrences   billing-settlement, fleet-partner, multi-taxi,
                        certificate-support, owned-mobility
"TWD"  14 occurrences   platform-earnings, tenant governance seeds
```

Three module-local constants named `DEFAULT_CURRENCY` disagree:

- `billing-settlement.service.ts:102` → `"NTD"`
- `fleet-partner.service.ts:40` → `"NTD"`
- `platform-earnings.service.ts:15` → `"TWD"`

**`sumMoney` cannot notice.** It reduces over `amountMinor` and stamps the module's own
default on the result:

```ts
private sumMoney(amounts: MoneyAmount[]) {
  return this.money(amounts.reduce((sum, a) => sum + a.amountMinor, 0));
}
private money(amountMinor: number): MoneyAmount {
  return { currency: DEFAULT_CURRENCY, amountMinor };
}
```

The input currencies are discarded. A `MoneyAmount` carries a currency, which says it can
vary; the arithmetic assumes it cannot. Those two statements are both in the codebase and
nothing reconciles them.

### 3.1 The part that already bites

`certificate-support.service.ts:535` requires `row.currency === "NTD"` for
`hasCanonicalArtifactFields`, which gates `artifactsAvailable`, which gates whether the
電子憑證 — a real streamed PDF, the passenger's receipt — is offered at all, and whether
regeneration is enabled.

A row labelled `TWD` therefore produces no certificate, no error, and no explanation. The
absence looks like a record that is simply not ready.

This is latent rather than live: `PersistInitialCertificate.currency` is typed as the
literal `"NTD"`, so the write path cannot currently produce anything else. But the read
path types the same field as `string`, and the moment anybody standardises on the ISO code
— which is the correct thing to do — the certificate quietly stops being available.

The three other hard-coded rejections (`certificate-support.service.ts:400`,
`owned-mobility.service.ts:5351` and `:7926`) fail loudly, which is the safer half of the
same problem.

---

## 4. Why this survived

The two halves have never met. `platform-earnings` reads external platform earnings for a
driver; `billing-settlement` settles owned trips. Neither imports the other, and no total
spans both. The mismatch is therefore invisible to every test, because no test has a reason
to add a number from one to a number from the other.

That is the same shape as the report defect: a field nobody validated across a boundary
nobody crossed. It stays harmless exactly until someone builds the first thing that crosses
it — a consolidated driver earnings view, say, which is a natural next feature.

---

## 5. Remediation

1. **Pick `TWD`.** It is the ISO 4217 code, it is what an external payment or accounting
   system will expect, and it is already what a third of the codebase says.
2. **Make it one constant.** Three module-local `DEFAULT_CURRENCY` declarations are three
   chances to disagree; a single exported constant in `packages/contracts` is one.
3. **Make `sumMoney` refuse to add across currencies** rather than silently relabel. Even
   with one currency in Phase 1, an addition that cannot state its own unit is a defect
   waiting for a second currency.
4. **Fix the silent gate.** Whatever the currency rule ends up being,
   `hasCanonicalArtifactFields` should not be able to withhold a passenger's receipt
   without saying why.

Steps 1 and 2 are a rename with a compile-time guarantee once the constant is shared.
Step 3 is a few lines. Step 4 matters most and is independent of the rename.

---

## 6. Traceability

| Finding                                                            | Severity | Nature                                              |
| ------------------------------------------------------------------ | -------- | --------------------------------------------------- |
| One currency written two ways across 41 sites                      | P1       | unit mismatch across a boundary nothing crosses yet |
| `sumMoney` discards input currency and stamps a module default     | P1       | arithmetic that cannot state its own unit           |
| A non-`NTD` currency silently withholds the electronic certificate | P1       | latent; fails closed and says nothing               |
| Three module-local `DEFAULT_CURRENCY` constants                    | P2       | three places that must agree                        |
| Money arithmetic, rounding and totals                              | —        | sound; no action                                    |
