// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import crypto from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { db, settings } from '@evtivity/database';
import { decryptString } from '@evtivity/lib';
import { config as apiConfig } from '../lib/config.js';

export interface PhonePeConfig {
  merchantId: string;
  saltKey: string;
  saltIndex: string | number;
  environment: 'sandbox' | 'production';
  baseUrl: string;
  defaultPreAuthAmountPaisa: number;
  isEnabled: boolean;
}

interface CachedPhonePeConfig {
  config: PhonePeConfig;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedConfig: CachedPhonePeConfig | null = null;

const PHONEPE_SANDBOX_BASE_URL = 'https://api-preprod.phonepe.com/apis/pg-sandbox';
const PHONEPE_PRODUCTION_BASE_URL = 'https://api.phonepe.com/apis/pg';

function getEncryptionKey(): string {
  const key = apiConfig.SETTINGS_ENCRYPTION_KEY;
  if (key === '') {
    throw new Error('SETTINGS_ENCRYPTION_KEY environment variable is required');
  }
  return key;
}

export function generatePhonePeChecksum(
  payloadBase64OrEndpoint: string,
  saltKey: string,
  saltIndex: string | number,
  endpoint?: string,
): string {
  const stringToHash =
    endpoint != null
      ? `${payloadBase64OrEndpoint}${endpoint}${saltKey}`
      : `${payloadBase64OrEndpoint}${saltKey}`;
  const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
  return `${sha256}###${saltIndex}`;
}

export async function getPhonePeConfig(): Promise<PhonePeConfig | null> {
  if (cachedConfig != null && cachedConfig.expiresAt > Date.now()) {
    return cachedConfig.config;
  }

  // 1. First check environment variables (if provided)
  const envMerchantId = process.env.PHONEPE_MERCHANT_ID;
  const envSaltKey = process.env.PHONEPE_SALT_KEY;
  const envSaltIndex = process.env.PHONEPE_SALT_INDEX ?? '1';
  const envEnvironment = (process.env.PHONEPE_ENV ?? 'sandbox') as 'sandbox' | 'production';

  if (envMerchantId && envSaltKey) {
    const config: PhonePeConfig = {
      merchantId: envMerchantId,
      saltKey: envSaltKey,
      saltIndex: envSaltIndex,
      environment: envEnvironment,
      baseUrl:
        envEnvironment === 'production' ? PHONEPE_PRODUCTION_BASE_URL : PHONEPE_SANDBOX_BASE_URL,
      defaultPreAuthAmountPaisa: 10000, // ₹100
      isEnabled: true,
    };
    cachedConfig = { config, expiresAt: Date.now() + CACHE_TTL_MS };
    return config;
  }

  // 2. Query Postgres settings table
  const keys = [
    'phonepe.merchantId',
    'phonepe.saltKeyEnc',
    'phonepe.saltIndex',
    'phonepe.environment',
    'phonepe.enabled',
    'phonepe.defaultPreAuthAmountPaisa',
  ];

  const rows = await db.select().from(settings).where(inArray(settings.key, keys));
  const settingsMap = new Map<string, unknown>();
  for (const row of rows) {
    settingsMap.set(row.key, row.value);
  }

  const merchantId = (settingsMap.get('phonepe.merchantId') as string | undefined)?.trim();
  const saltKeyEnc = (settingsMap.get('phonepe.saltKeyEnc') as string | undefined)?.trim();
  const saltIndex = (settingsMap.get('phonepe.saltIndex') as string | number | undefined) ?? '1';
  const environment = (settingsMap.get('phonepe.environment') as string | undefined) ?? 'sandbox';
  const isEnabled = Boolean(settingsMap.get('phonepe.enabled') ?? false);
  const defaultPreAuthAmountPaisa = Number(
    settingsMap.get('phonepe.defaultPreAuthAmountPaisa') ?? 10000,
  );

  if (!merchantId || !saltKeyEnc) {
    return null;
  }

  let saltKey: string;
  try {
    const encryptionKey = getEncryptionKey();
    saltKey = decryptString(saltKeyEnc, encryptionKey);
  } catch {
    return null;
  }

  const env = environment === 'production' ? 'production' : 'sandbox';
  const config: PhonePeConfig = {
    merchantId,
    saltKey,
    saltIndex,
    environment: env,
    baseUrl: env === 'production' ? PHONEPE_PRODUCTION_BASE_URL : PHONEPE_SANDBOX_BASE_URL,
    defaultPreAuthAmountPaisa,
    isEnabled,
  };

  cachedConfig = { config, expiresAt: Date.now() + CACHE_TTL_MS };
  return config;
}

export function clearPhonePeConfigCache(): void {
  cachedConfig = null;
}

export interface InitiatePaymentParams {
  merchantTransactionId: string;
  merchantUserId: string;
  amountPaisa: number;
  redirectUrl: string;
  callbackUrl: string;
  mobileNumber?: string;
  deviceContext?: {
    deviceOS?: 'ANDROID' | 'IOS';
  };
}

export interface InitiatePaymentResult {
  success: boolean;
  code: string;
  message: string;
  merchantTransactionId: string;
  redirectUrl: string;
  upiIntentUrl?: string;
  rawResponse: Record<string, unknown>;
}

export async function createPhonePePaymentOrder(
  config: PhonePeConfig,
  params: InitiatePaymentParams,
): Promise<InitiatePaymentResult> {
  const payload = {
    merchantId: config.merchantId,
    merchantTransactionId: params.merchantTransactionId,
    merchantUserId: params.merchantUserId,
    amount: params.amountPaisa,
    redirectUrl: params.redirectUrl,
    redirectMode: 'REDIRECT',
    callbackUrl: params.callbackUrl,
    ...(params.mobileNumber ? { mobileNumber: params.mobileNumber } : {}),
    paymentInstrument: {
      type: 'PAY_PAGE',
    },
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const endpoint = '/pg/v1/pay';
  const checksum = generatePhonePeChecksum(
    payloadBase64,
    config.saltKey,
    config.saltIndex,
    endpoint,
  );

  const response = await fetch(`${config.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': checksum,
      accept: 'application/json',
    },
    body: JSON.stringify({ request: payloadBase64 }),
  });

  const body = (await response.json()) as {
    success: boolean;
    code: string;
    message: string;
    data?: {
      merchantTransactionId: string;
      instrumentResponse?: {
        type: string;
        redirectInfo?: {
          url: string;
        };
        intentUrl?: string;
      };
    };
  };

  if (!response.ok || !body.success) {
    throw new Error(body.message || `PhonePe payment initiation failed with code ${body.code}`);
  }

  const redirectUrl = body.data?.instrumentResponse?.redirectInfo?.url ?? '';
  const upiIntentUrl = body.data?.instrumentResponse?.intentUrl;

  return {
    success: body.success,
    code: body.code,
    message: body.message,
    merchantTransactionId: params.merchantTransactionId,
    redirectUrl,
    upiIntentUrl,
    rawResponse: body as unknown as Record<string, unknown>,
  };
}

export interface PaymentStatusResult {
  success: boolean;
  code: string;
  message: string;
  state: 'COMPLETED' | 'FAILED' | 'PENDING';
  amountPaisa: number;
  transactionId?: string;
  paymentInstrument?: Record<string, unknown>;
}

export async function checkPhonePePaymentStatus(
  config: PhonePeConfig,
  merchantTransactionId: string,
): Promise<PaymentStatusResult> {
  const endpoint = `/pg/v1/status/${config.merchantId}/${merchantTransactionId}`;
  const checksum = generatePhonePeChecksum(endpoint, config.saltKey, config.saltIndex);

  const response = await fetch(`${config.baseUrl}${endpoint}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': checksum,
      'X-MERCHANT-ID': config.merchantId,
      accept: 'application/json',
    },
  });

  const body = (await response.json()) as {
    success: boolean;
    code: string;
    message: string;
    data?: {
      merchantTransactionId: string;
      transactionId: string;
      amount: number;
      state: 'COMPLETED' | 'FAILED' | 'PENDING';
      responseCode: string;
      paymentInstrument?: Record<string, unknown>;
    };
  };

  return {
    success: body.success,
    code: body.code,
    message: body.message,
    state: body.data?.state ?? 'PENDING',
    amountPaisa: body.data?.amount ?? 0,
    transactionId: body.data?.transactionId,
    paymentInstrument: body.data?.paymentInstrument,
  };
}

export interface RefundParams {
  merchantTransactionId: string;
  originalTransactionId?: string;
  merchantUserId: string;
  amountPaisa: number;
  callbackUrl?: string;
}

export interface RefundResult {
  success: boolean;
  code: string;
  message: string;
  refundTransactionId?: string;
  state?: string;
}

export async function refundPhonePePayment(
  config: PhonePeConfig,
  params: RefundParams,
): Promise<RefundResult> {
  const payload = {
    merchantId: config.merchantId,
    merchantUserId: params.merchantUserId,
    merchantTransactionId: params.merchantTransactionId,
    ...(params.originalTransactionId
      ? { originalTransactionId: params.originalTransactionId }
      : {}),
    amount: params.amountPaisa,
    ...(params.callbackUrl ? { callbackUrl: params.callbackUrl } : {}),
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const endpoint = '/pg/v1/refund';
  const checksum = generatePhonePeChecksum(
    payloadBase64,
    config.saltKey,
    config.saltIndex,
    endpoint,
  );

  const response = await fetch(`${config.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': checksum,
      accept: 'application/json',
    },
    body: JSON.stringify({ request: payloadBase64 }),
  });

  const body = (await response.json()) as {
    success: boolean;
    code: string;
    message: string;
    data?: {
      merchantTransactionId: string;
      transactionId: string;
      amount: number;
      state: string;
    };
  };

  if (!response.ok || !body.success) {
    throw new Error(body.message || `PhonePe refund failed with code ${body.code}`);
  }

  return {
    success: body.success,
    code: body.code,
    message: body.message,
    refundTransactionId: body.data?.transactionId,
    state: body.data?.state,
  };
}

export function verifyPhonePeWebhookSignature(
  xVerifyHeader: string,
  base64Response: string,
  saltKey: string,
  saltIndex: string | number,
): boolean {
  const expectedChecksum = generatePhonePeChecksum(base64Response, saltKey, saltIndex);
  return xVerifyHeader === expectedChecksum;
}
