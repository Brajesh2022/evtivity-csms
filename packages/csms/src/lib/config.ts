// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

interface RuntimeConfig {
  apiUrl: string;
  portalUrl: string;
  csmsUrl: string;
  ocppUrl: string;
}

const runtimeConfig = (window as unknown as { __RUNTIME_CONFIG__?: RuntimeConfig })
  .__RUNTIME_CONFIG__;

export function cleanBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getDefaultPortalUrl(): string {
  if (typeof window === 'undefined' || !window.location) {
    return 'http://localhost:7101';
  }
  const { protocol, hostname } = window.location;
  // If hosted under an admin subdomain (e.g. admin.aceitmobility.in), map to the charge portal subdomain
  if (hostname.startsWith('admin.')) {
    return `${protocol}//${hostname.replace(/^admin\./, 'charge.')}`;
  }
  // Fallback for localhost or direct IP development access
  return `${protocol}//${hostname}:7101`;
}

export function getDefaultOcppUrl(): string {
  if (typeof window === 'undefined' || !window.location) {
    return 'ws://localhost:7103';
  }
  const { protocol, hostname } = window.location;
  if (hostname.startsWith('admin.')) {
    const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${hostname.replace(/^admin\./, 'ocpp.')}`;
  }
  return `ws://${hostname}:7103`;
}

const rawApiUrl =
  runtimeConfig?.apiUrl && runtimeConfig.apiUrl.trim() !== ''
    ? runtimeConfig.apiUrl.trim()
    : (import.meta.env.VITE_API_URL as string | undefined)?.trim();

export const API_BASE_URL: string = rawApiUrl ? cleanBaseUrl(rawApiUrl) : '';

const rawPortalUrl =
  runtimeConfig?.portalUrl && runtimeConfig.portalUrl.trim() !== ''
    ? runtimeConfig.portalUrl.trim()
    : (import.meta.env.VITE_PORTAL_URL as string | undefined)?.trim();

export const PORTAL_BASE_URL: string = cleanBaseUrl(rawPortalUrl || getDefaultPortalUrl());

const rawOcppUrl =
  runtimeConfig?.ocppUrl && runtimeConfig.ocppUrl.trim() !== ''
    ? runtimeConfig.ocppUrl.trim()
    : (import.meta.env.VITE_OCPP_URL as string | undefined)?.trim();

export const OCPP_BASE_URL: string = cleanBaseUrl(rawOcppUrl || getDefaultOcppUrl());
