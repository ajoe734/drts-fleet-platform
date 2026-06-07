import { Controller, Get, Headers } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type { ProductRuleCatalog } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import {
  BUSINESS_DISPATCH_SUBTYPE_VALUES,
  DISPATCH_SEMANTIC_VALUES,
  FUTURE_SERVICE_BUCKET_VALUES,
  ORDER_DOMAIN_VALUES,
  PHASE1_SERVICE_BUCKET_VALUES,
} from "../foundation/foundation.constants";

// Static read catalog consumed on every Platform Admin pricing page load.
// READ_HEAVY (180/min, no block) instead of the global default (60/min with a
// 5-min block) so a burst can never lock the pricing page out for minutes.
@Throttle(READ_HEAVY_RATE_LIMIT)
@Controller("product-rule")
export class ProductRuleController {
  @Get("catalog")
  getCatalog(@Headers("x-request-id") requestId?: string) {
    const catalog: ProductRuleCatalog = {
      phase1ServiceBuckets: [...PHASE1_SERVICE_BUCKET_VALUES],
      futureServiceBuckets: [...FUTURE_SERVICE_BUCKET_VALUES],
      dispatchSemantics: [...DISPATCH_SEMANTIC_VALUES],
      businessDispatchSubtypes: [...BUSINESS_DISPATCH_SUBTYPE_VALUES],
      orderDomains: [...ORDER_DOMAIN_VALUES],
      pricingAuthority: {
        canonicalQuotedFareSource: "platform_pricing_rule",
        canonicalPricingRuleVersion: "enterprise_dispatch.default.v1",
        tenantCanSetQuotedFare: false,
        partnerCanSetQuotedFare: false,
        manualOverrideActorTypes: ["platform_admin", "ops_user"],
        manualOverrideRequiredFields: ["actor", "reason", "traceId"],
      },
    };

    return toApiSuccessEnvelope(catalog, requestId);
  }
}
