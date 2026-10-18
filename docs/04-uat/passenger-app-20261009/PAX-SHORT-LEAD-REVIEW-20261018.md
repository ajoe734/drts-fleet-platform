# PAX-SHORT-LEAD-REVIEW-20261018

The booking screen already validates the current minimum lead time. The existing
unit case named “past/short lead” and the D browser prerequisite stage only
entered `2000-01-01T00:00`. That proves past-time refusal, but does not demonstrate
a requested time which is still in the future and below the configured minimum.

The original unit case now exercises both refusals and recovery to a valid quote.
The original D browser stage refreshes settings through the existing control,
clears the earlier past-time message, reads the actual minimum, and selects a
representable future minute strictly inside that window. A short real wait near
a minute boundary keeps the requested time in the future through validation and
the screenshot. No clock or booking rule changes.

The browser requires the original refusal, no quote or ride POST, no confirmation
sheet, and a preserved time draft. It saves `D-future-short-lead-refused-pax` and
`D-future-short-lead-facts` before any D order exists; the original recovery then
quotes and creates the real D order, retaining the existing dispatch, cancellation
and additional branches. The original 48+60+13+21+21 stage sequences remain intact.
There is one additional prebooking PNG in the 60-stage additional journey.

Local verification and actual hosted results are recorded in the task evidence
under `.local/`. Browser execution belongs to GitHub-hosted/shared Cloud Run
verification; no product or browser server runs on this VM. Local unit evidence
does not count as hosted or shared acceptance. The current `3012a` shared release
and its in-progress original workflow remain independent of this follow-up.

This change extends test and review coverage. The existing booking implementation,
time rules, identity handling, external simulation ports and original acceptance
requirements remain unchanged. Full system and production completion are separate.
