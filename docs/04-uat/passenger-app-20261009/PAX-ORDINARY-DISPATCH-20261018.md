# PAX-ORDINARY-DISPATCH-20261018

The ordinary `/dispatch/:orderId` workspace can assign an existing candidate,
but had no create action when a passenger order had no dispatch job. Its header
instead displayed “Read-only · terminal” for that active order. The review page
had the only Ops UI caller of the existing order dispatch endpoint. Its detail
link also switched from order UUID to dispatch job UUID after a job existed,
although the ordinary detail resolver expects an order UUID or order number.

The ordinary owned-order header now offers Create dispatch while the original
state permits creation and the required data reads succeeded. The control uses
the existing Ops SDK, BFF, command body and acknowledgement headers, then refreshes
the real server workspace. Existing backend dispatch, assignment and identity
rules remain unchanged. The detail link always references the original order.
Active orders with no current action no longer use the terminal-only label.

The original A create stage operates this ordinary workspace on the newly booked
Passenger order. It checks the actual create POST, same order readback, one linked
dispatch job and real server refresh, and saves two original Ops PNGs and facts.
The same Ops page preserves the original cross-role response journal. It then
returns to review assignment/reassignment and the remaining original journey;
this does not claim an entirely ordinary Ops journey or native/physical operation.
All original 48+60+13+21+21 stages and external simulation boundaries are retained.

Local unit checks exercise the real control, SDK and BFF with substituted upstream
HTTP only. Hosted browser/shared runtime acceptance is separate. No product or
browser server is started on the VM. The deployed `.0@3012a` packet remains a
separately preserved release until this source is actually accepted and deployed.
