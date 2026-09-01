// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '@evtivity/database';
import {
  chargingStations,
  evses,
  paymentRecords,
} from '@evtivity/database';
import { zodSchema } from '../../lib/zod-schema.js';
import { itemResponse, errorWith } from '../../lib/response-schemas.js';
import { ERROR_CODES } from '../../lib/error-codes.generated.js';
import {
  getPhonePeConfig,
  createPhonePePaymentOrder,
  checkPhonePePaymentStatus,
  verifyPhonePeWebhookSignature,
} from '../../services/phonepe.service.js';
import { checkStationOnboarded } from '../../lib/onboarding-gate.js';
import type { DriverJwtPayload } from '../../plugins/auth.js';

const initiatePhonePeBody = z.object({
  stationId: z.string().min(1),
  evseId: z.number().int().min(1),
  amountPaisa: z.number().int().min(100).optional(), // Default ₹100 (10000 paisa)
  mobileNumber: z.string().max(15).optional(),
  guestEmail: z.string().email().optional(),
  redirectUrl: z.string().url().optional(),
});

const initiatePhonePeResponse = z.object({
  merchantTransactionId: z.string(),
  redirectUrl: z.string(),
  upiIntentUrl: z.string().optional(),
});

const statusParams = z.object({
  merchantTransactionId: z.string().min(1),
});

const phonePeStatusResponse = z.object({
  merchantTransactionId: z.string(),
  state: z.enum(['COMPLETED', 'PENDING', 'FAILED']),
  amountPaisa: z.number(),
  sessionId: z.string().nullable(),
});

export async function portalPhonePeRoutes(app: FastifyInstance): Promise<void> {
  // Initiate PhonePe Payment Order
  app.post(
    '/portal/payments/phonepe/initiate',
    {
      schema: {
        tags: ['Portal Payments'],
        summary: 'Initiate PhonePe payment order for EV charging session',
        body: zodSchema(initiatePhonePeBody),
        response: {
          200: itemResponse(initiatePhonePeResponse),
          400: errorWith('Payment failed', [ERROR_CODES.PAYMENT_FAILED]),
          403: errorWith('Station offline', [ERROR_CODES.STATION_OFFLINE]),
          404: errorWith('Resource not found', [
            ERROR_CODES.STATION_NOT_FOUND,
            ERROR_CODES.EVSE_NOT_FOUND,
          ]),
          503: errorWith('Payment provider not configured', [
            ERROR_CODES.PAYMENT_PROVIDER_NOT_CONFIGURED,
          ]),
        },
      },
    },
    async (request, reply) => {
      const config = await getPhonePeConfig();
      if (config == null || !config.isEnabled) {
        await reply.status(503).send({
          error: 'PhonePe payment provider is not configured or disabled',
          code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        });
        return;
      }

      const body = request.body as z.infer<typeof initiatePhonePeBody>;
      const user = request.user as DriverJwtPayload | undefined;
      const driverId = user?.driverId ?? null;

      // Verify Station
      const [station] = await db
        .select({
          id: chargingStations.id,
          stationId: chargingStations.stationId,
          isOnline: chargingStations.isOnline,
          onboardingStatus: chargingStations.onboardingStatus,
          siteId: chargingStations.siteId,
        })
        .from(chargingStations)
        .where(eq(chargingStations.stationId, body.stationId));

      if (station == null) {
        await reply.status(404).send({ error: 'Station not found', code: 'STATION_NOT_FOUND' });
        return;
      }

      const allowed = await checkStationOnboarded(station, reply);
      if (!allowed) return;

      if (!station.isOnline) {
        await reply.status(403).send({ error: 'Station is offline', code: 'STATION_OFFLINE' });
        return;
      }

      // Verify EVSE
      const [evse] = await db
        .select({ id: evses.id, evseId: evses.evseId })
        .from(evses)
        .where(and(eq(evses.stationId, station.id), eq(evses.evseId, body.evseId)));

      if (evse == null) {
        await reply.status(404).send({ error: 'EVSE not found', code: 'EVSE_NOT_FOUND' });
        return;
      }

      const amountPaisa = body.amountPaisa ?? config.defaultPreAuthAmountPaisa ?? 10000;
      const merchantTransactionId = `TXN_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      const merchantUserId = driverId ?? `GUEST_${crypto.randomUUID().slice(0, 8)}`;

      // Resolve host for redirect/callback
      const host = request.headers.host ?? '103.216.171.32:7101';
      const protocol = request.protocol ?? 'http';
      const defaultRedirectUrl = `${protocol}://${host}/charge/${station.stationId}/${String(evse.evseId)}?phonepeOrderId=${merchantTransactionId}`;
      const callbackUrl = `${protocol}://${host}/v1/webhooks/phonepe`;

      const paymentParams: {
        merchantTransactionId: string;
        merchantUserId: string;
        amountPaisa: number;
        redirectUrl: string;
        callbackUrl: string;
        mobileNumber?: string;
      } = {
        merchantTransactionId,
        merchantUserId,
        amountPaisa,
        redirectUrl: body.redirectUrl ?? defaultRedirectUrl,
        callbackUrl,
      };

      if (body.mobileNumber) {
        paymentParams.mobileNumber = body.mobileNumber;
      }

      const result = await createPhonePePaymentOrder(config, paymentParams);

      // Insert pending payment record
      await db.insert(paymentRecords).values({
        driverId,
        paymentSource: 'phonepe',
        currency: 'INR',
        preAuthAmountCents: amountPaisa,
        status: 'pending',
        metadata: {
          phonepeOrderId: merchantTransactionId,
          stationId: station.stationId,
          stationDbId: station.id,
          evseId: evse.evseId,
          evseDbId: evse.id,
          guestEmail: body.guestEmail,
          merchantUserId,
        },
      });

      return {
        merchantTransactionId,
        redirectUrl: result.redirectUrl,
        upiIntentUrl: result.upiIntentUrl,
      };
    },
  );

  // Check PhonePe Payment Status
  app.get(
    '/portal/payments/phonepe/status/:merchantTransactionId',
    {
      schema: {
        tags: ['Portal Payments'],
        summary: 'Check status of PhonePe payment transaction',
        params: zodSchema(statusParams),
        response: {
          200: itemResponse(phonePeStatusResponse),
          404: errorWith('Transaction not found', [ERROR_CODES.PAYMENT_NOT_FOUND]),
          503: errorWith('Payment provider not configured', [
            ERROR_CODES.PAYMENT_PROVIDER_NOT_CONFIGURED,
          ]),
        },
      },
    },
    async (request, reply) => {
      const { merchantTransactionId } = request.params as z.infer<typeof statusParams>;
      const config = await getPhonePeConfig();
      if (config == null) {
        await reply.status(503).send({
          error: 'PhonePe provider not configured',
          code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        });
        return;
      }

      const statusResult = await checkPhonePePaymentStatus(config, merchantTransactionId);

      // Look up payment record in DB
      const rows = await db
        .select()
        .from(paymentRecords)
        .where(eq(paymentRecords.paymentSource, 'phonepe'));

      const record = rows.find(
        (r) =>
          r.metadata != null &&
          typeof r.metadata === 'object' &&
          (r.metadata as Record<string, unknown>).phonepeOrderId === merchantTransactionId,
      );

      if (record == null) {
        await reply.status(404).send({ error: 'Payment record not found', code: 'PAYMENT_NOT_FOUND' });
        return;
      }

      // If PhonePe returned completed and record is still pending, update record to pre_authorized
      if (statusResult.state === 'COMPLETED' && record.status === 'pending') {
        await db
          .update(paymentRecords)
          .set({
            status: 'pre_authorized',
            updatedAt: new Date(),
          })
          .where(eq(paymentRecords.id, record.id));
      }

      return {
        merchantTransactionId,
        state: statusResult.state,
        amountPaisa: statusResult.amountPaisa,
        sessionId: record.sessionId,
      };
    },
  );

  // Public PhonePe Webhook Callback
  app.post('/webhooks/phonepe', async (request, reply) => {
    const config = await getPhonePeConfig();
    if (config == null) {
      await reply.status(200).send({ status: 'ignored' });
      return;
    }

    const xVerify = request.headers['x-verify'] as string | undefined;
    const body = request.body as { response?: string };

    if (!xVerify || !body?.response) {
      await reply.status(400).send({ error: 'Missing response or checksum' });
      return;
    }

    const isValid = verifyPhonePeWebhookSignature(
      xVerify,
      body.response,
      config.saltKey,
      config.saltIndex,
    );

    if (!isValid) {
      request.log.warn('Invalid PhonePe webhook signature');
      await reply.status(400).send({ error: 'Invalid signature' });
      return;
    }

    try {
      const decoded = JSON.parse(Buffer.from(body.response, 'base64').toString('utf8')) as {
        success: boolean;
        code: string;
        data?: {
          merchantTransactionId: string;
          transactionId: string;
          amount: number;
          state: string;
          responseCode: string;
        };
      };

      if (decoded.success && decoded.data?.state === 'COMPLETED') {
        const orderId = decoded.data.merchantTransactionId;
        const allRecords = await db
          .select()
          .from(paymentRecords)
          .where(eq(paymentRecords.paymentSource, 'phonepe'));

        const record = allRecords.find(
          (r) =>
            r.metadata != null &&
            typeof r.metadata === 'object' &&
            (r.metadata as Record<string, unknown>).phonepeOrderId === orderId,
        );

        if (record != null && record.status === 'pending') {
          await db
            .update(paymentRecords)
            .set({
              status: 'pre_authorized',
              updatedAt: new Date(),
            })
            .where(eq(paymentRecords.id, record.id));
        }
      }
    } catch (err) {
      request.log.warn({ err }, 'Error processing PhonePe webhook payload');
    }

    await reply.status(200).send({ status: 'ok' });
  });
}
