// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanBaseUrl, getDefaultPortalUrl, getDefaultOcppUrl } from '../config';

describe('config utilities', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // Reset window.location mock
    // @ts-expect-error - vitest allows deleting location for mock setup
    delete window.location;
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  describe('cleanBaseUrl', () => {
    it('removes single and multiple trailing slashes', () => {
      expect(cleanBaseUrl('https://charge.aceitmobility.in/')).toBe('https://charge.aceitmobility.in');
      expect(cleanBaseUrl('https://charge.aceitmobility.in///')).toBe('https://charge.aceitmobility.in');
    });

    it('preserves url without trailing slashes', () => {
      expect(cleanBaseUrl('https://charge.aceitmobility.in')).toBe('https://charge.aceitmobility.in');
    });
  });

  describe('getDefaultPortalUrl', () => {
    it('maps admin subdomain to charge subdomain under https', () => {
      window.location = {
        protocol: 'https:',
        hostname: 'admin.aceitmobility.in',
      } as unknown as Location;

      expect(getDefaultPortalUrl()).toBe('https://charge.aceitmobility.in');
    });

    it('maps admin subdomain to charge subdomain under http', () => {
      window.location = {
        protocol: 'http:',
        hostname: 'admin.evtivity.local',
      } as unknown as Location;

      expect(getDefaultPortalUrl()).toBe('http://charge.evtivity.local');
    });

    it('falls back to port 7101 for localhost', () => {
      window.location = {
        protocol: 'http:',
        hostname: 'localhost',
      } as unknown as Location;

      expect(getDefaultPortalUrl()).toBe('http://localhost:7101');
    });

    it('falls back to port 7101 for raw IP addresses', () => {
      window.location = {
        protocol: 'http:',
        hostname: '103.216.171.32',
      } as unknown as Location;

      expect(getDefaultPortalUrl()).toBe('http://103.216.171.32:7101');
    });
  });

  describe('getDefaultOcppUrl', () => {
    it('maps admin subdomain to wss://ocpp under https', () => {
      window.location = {
        protocol: 'https:',
        hostname: 'admin.aceitmobility.in',
      } as unknown as Location;

      expect(getDefaultOcppUrl()).toBe('wss://ocpp.aceitmobility.in');
    });

    it('falls back to ws://hostname:7103 for localhost', () => {
      window.location = {
        protocol: 'http:',
        hostname: 'localhost',
      } as unknown as Location;

      expect(getDefaultOcppUrl()).toBe('ws://localhost:7103');
    });
  });
});
