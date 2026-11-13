#!/usr/bin/env bash
# External city/airport facts are SIM. Governance, geometry checks and booking stay real.
# Source after helpers.sh. Only these newly created area IDs are retired on EXIT.
E2E_AIRPORT_AREA_IDS=()
E2E_AIRPORT_GOV_FILES=()

prepare_airport_service_areas() {
  # Bash locals keep this fixture's platform actor from replacing the scenario actor.
  local E2E_ACTOR_TYPE="$E2E_ACTOR_TYPE" E2E_ACTOR_ID="$E2E_ACTOR_ID"
  local E2E_REALM="$E2E_REALM" E2E_TENANT_ID="$E2E_TENANT_ID"
  local E2E_REQUEST_BEARER_TOKEN="$E2E_REQUEST_BEARER_TOKEN"
  local E2E_PARTNER_ID="$E2E_PARTNER_ID" E2E_PARTNER_PROGRAM_ID="$E2E_PARTNER_PROGRAM_ID"
  local E2E_PARTNER_ENTRY_SLUG="$E2E_PARTNER_ENTRY_SLUG"
  local E2E_FLEET_PARTNER_ID="$E2E_FLEET_PARTNER_ID" E2E_EXTRA_SCOPES="$E2E_EXTRA_SCOPES"
  switch_actor "platform_admin" "e2e-platform-admin-001"

  local suffix="${SCENARIO//-/_}_$(date +%s%N)_$$"
  local effective_from effective_until create_fixture publish_fixture kind area_code area_id
  effective_from=$(date -u -d '-1 minute' +'%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
    || date -u -v-1M +'%Y-%m-%dT%H:%M:%SZ')
  effective_until=$(date -u -d '+2 hours' +'%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
    || date -u -v+2H +'%Y-%m-%dT%H:%M:%SZ')
  create_fixture=$(mktemp /tmp/drts-e2e-airport-area-create-XXXXXX.json)
  E2E_AIRPORT_GOV_FILES+=("$create_fixture")
  publish_fixture=$(mktemp /tmp/drts-e2e-airport-area-publish-XXXXXX.json)
  E2E_AIRPORT_GOV_FILES+=("$publish_fixture")
  printf '%s\n' '{"reason":"Disposable cross-surface external geography SIM; internal evaluation remains real"}' > "$publish_fixture"

  for kind in CITY AIRPORT; do
    area_code="E2E_SIM_${kind}_${suffix}"
    jq -n --arg code "$area_code" --arg kind "$kind" \
      --arg since "$effective_from" --arg until "$effective_until" \
      '{
        areaCode: $code,
        displayName: ("SIM cross-surface " + $kind + " airport-transfer boundary"),
        geometry: (if $kind == "CITY" then {
          type: "polygon", coordinates: [
            {lat: 25.0005, lng: 121.4505}, {lat: 25.0005, lng: 121.625},
            {lat: 25.125, lng: 121.625}, {lat: 25.125, lng: 121.4505}
          ]
        } else {
          type: "circle", center: {lat: 25.0797, lng: 121.2342}, radiusMeters: 6500
        } end),
        serviceProductTypes: ["credit_card_airport_transfer"],
        effectiveFrom: $since, effectiveUntil: $until,
        metadata: ({source: "cross-surface-external-geography-SIM", fixture: true}
          + (if $kind == "AIRPORT" then {airportIataCode: "TPE"} else {} end))
      }' > "$create_fixture"
    log_step "Airport SIM governance — create ${kind} boundary"
    http_call POST "/service-area/admin/service-areas" "$create_fixture"
    assert_status "200|201"
    area_id=$(json_get_first '.data.serviceArea.serviceAreaId' '.data.service_area.service_area_id')
    if [[ ! "$area_id" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]]; then
      log_fail "Normal governance did not return a serviceAreaId for ${kind}."
      return 1
    fi
    E2E_AIRPORT_AREA_IDS+=("$area_id") # Register before publish, including partial setup.
    http_call POST "/service-area/admin/service-areas/${area_id}/publish" "$publish_fixture"
    assert_status "200|201"
    echo "$RESP_BODY" | jq -e --arg id "$area_id" --arg code "$area_code" --arg kind "$kind" '
      (.data.serviceArea // .data.service_area) as $area |
      ($area.serviceAreaId // $area.service_area_id) == $id and
      ($area.areaCode // $area.area_code) == $code and $area.status == "active" and
      ($area.serviceProductTypes // $area.service_product_types) == ["credit_card_airport_transfer"] and
      $area.metadata.source == "cross-surface-external-geography-SIM" and
      $area.metadata.fixture == true and
      (if $kind == "AIRPORT" then
        ($area.metadata.airportIataCode // $area.metadata.airport_iata_code) == "TPE"
       else ($area.metadata.airportIataCode // $area.metadata.airport_iata_code) == null end)
    ' > /dev/null
    save_evidence "$SCENARIO" "platform_admin" "${kind}ServiceAreaId" "$area_id"
  done
  rm -f "$create_fixture" "$publish_fixture"
}

cleanup_airport_service_areas() (
  # Subshell preserves each scenario's original cleanup actor and exit handling.
  local failed=0 area_id retire_fixture index
  if [[ ${#E2E_AIRPORT_AREA_IDS[@]} -eq 0 ]]; then
    if [[ ${#E2E_AIRPORT_GOV_FILES[@]} -gt 0 ]]; then rm -f "${E2E_AIRPORT_GOV_FILES[@]}"; fi
    return 0
  fi
  switch_actor "platform_admin" "e2e-platform-admin-001"
  retire_fixture=$(mktemp /tmp/drts-e2e-airport-area-retire-XXXXXX.json)
  printf '%s\n' '{"reason":"Disposable cross-surface airport geography SIM complete"}' > "$retire_fixture"
  for ((index=${#E2E_AIRPORT_AREA_IDS[@]}-1; index>=0; index--)); do
    area_id="${E2E_AIRPORT_AREA_IDS[index]}"
    if http_call POST "/service-area/admin/service-areas/${area_id}/retire" "$retire_fixture" \
      && assert_status "200|201" \
      && echo "$RESP_BODY" | jq -e --arg id "$area_id" '
        (.data.serviceArea // .data.service_area) as $area |
        ($area.serviceAreaId // $area.service_area_id) == $id and $area.status == "retired"
      ' > /dev/null; then
      log_ok "Retired disposable airport area ${area_id}"
    else
      log_fail "Could not retire disposable airport area ${area_id}."
      failed=1
    fi
  done
  rm -f "$retire_fixture" "${E2E_AIRPORT_GOV_FILES[@]}"
  return "$failed"
)
