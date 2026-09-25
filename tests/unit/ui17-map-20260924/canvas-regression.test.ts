import { describe, test, expect } from 'vitest';
import { evaluateAddressSubmitGate } from '../../../packages/ui-web/src/address-map-app-support';

describe('UI17-MAP-20260924 gate behavior regressions', () => {
  const validAddress = {
    address: 'Taipei 101',
    coordinateSource: 'provider' as const,
    lat: 25.0330,
    lng: 121.5654,
  };
  const invalidAddress = {
    address: 'No Pin',
    coordinateSource: 'provider' as const,
  };
  
  test('tenant outage request prevention logic / provider_down with pins', () => {
    // When provider is down but we HAVE valid pins (like Concierge explicitly allows)
    // evaluateAddressSubmitGate itself should return dispatch_manual_review_required
    const gate = evaluateAddressSubmitGate({
      pickup: validAddress,
      dropoff: validAddress,
      serviceability: { decision: 'serviceable', reasonCode: 'ok' },
      providerState: { available: false, degraded: true, reasonCode: 'outage' },
    });
    expect(gate.blocking).toBe(false);
    expect(gate.code).toBe('dispatch_manual_review_required');
  });

  test('provider down with missing pins blocks on coordinates_required first', () => {
    // When provider is down and we DONT have pins, it blocks immediately
    const gate = evaluateAddressSubmitGate({
      pickup: invalidAddress as any,
      dropoff: validAddress,
      serviceability: { decision: 'serviceable', reasonCode: 'ok' },
      providerState: { available: false, degraded: true, reasonCode: 'outage' },
    });
    expect(gate.blocking).toBe(true);
    expect(gate.code).toBe('coordinates_required');
  });

  test('invalid manual pins or missing reason (coordinates_required)', () => {
    // Missing lat/lng
    const gate = evaluateAddressSubmitGate({
      pickup: {
        address: 'Manual Point',
        coordinateSource: 'manual',
        lat: NaN,
        lng: 121.5,
      },
      dropoff: validAddress,
      serviceability: { decision: 'serviceable', reasonCode: 'ok' },
    });
    expect(gate.blocking).toBe(true);
    expect(gate.code).toBe('coordinates_required');
  });

  test('outside service area takes precedence over provider outage', () => {
    const gate = evaluateAddressSubmitGate({
      pickup: validAddress,
      dropoff: validAddress,
      serviceability: { decision: 'not_serviceable', reasonCode: 'out_of_area' },
      providerState: { available: false, degraded: true, reasonCode: 'outage' },
    });
    expect(gate.blocking).toBe(true);
    expect(gate.code).toBe('outside_service_area');
  });

  test('healthy manual pins are fully ready if serviceable', () => {
    const gate = evaluateAddressSubmitGate({
      pickup: {
        ...validAddress,
        coordinateSource: 'manual',
      },
      dropoff: validAddress,
      serviceability: { decision: 'serviceable', reasonCode: 'ok' },
      providerState: { available: true, degraded: false, reasonCode: 'available' },
    });
    expect(gate.blocking).toBe(false);
    expect(gate.code).toBe('ready');
  });
});
