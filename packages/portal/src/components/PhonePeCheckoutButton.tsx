// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, Loader2, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export interface PhonePeCheckoutButtonProps {
  stationId: string;
  evseId: string | number;
  amountPaisa?: number;
  guestEmail?: string;
  mobileNumber?: string;
  onSuccess?: () => void;
  onError?: (err: string) => void;
  className?: string;
}

export function PhonePeCheckoutButton({
  stationId,
  evseId,
  amountPaisa = 10000, // ₹100 default
  guestEmail,
  mobileNumber,
  onSuccess,
  onError,
  className,
}: PhonePeCheckoutButtonProps): React.JSX.Element {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const amountRupees = (amountPaisa / 100).toFixed(0);

  async function handlePhonePePay(): Promise<void> {
    setLoading(true);
    try {
      const payload = {
        stationId,
        evseId: Number(evseId),
        amountPaisa,
        guestEmail,
        mobileNumber,
        redirectUrl: `${window.location.origin}/charge/${stationId}/${String(evseId)}`,
      };

      const result = await api.post<{
        merchantTransactionId: string;
        redirectUrl: string;
        upiIntentUrl?: string;
      }>('/v1/portal/payments/phonepe/initiate', payload);

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (isMobile && result.upiIntentUrl) {
        window.location.href = result.upiIntentUrl;
      } else if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
      } else {
        throw new Error('No redirect URL received from payment provider');
      }

      onSuccess?.();
    } catch (err: unknown) {
      const msg =
        err != null && typeof err === 'object' && 'body' in err
          ? String((err as { body: { error?: string } }).body.error ?? 'Payment failed')
          : 'Failed to initiate PhonePe payment';
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      className={`w-full gap-2 bg-[#5f259f] hover:bg-[#4d1e82] text-white font-medium py-3 rounded-lg shadow-sm transition-all ${className ?? ''}`}
      size="lg"
      disabled={loading}
      onClick={() => {
        void handlePhonePePay();
      }}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('guest.processing', 'Processing...')}
        </>
      ) : (
        <>
          <Zap className="h-4 w-4 fill-current text-yellow-300" />
          <span>Pay ₹{amountRupees} with PhonePe / UPI & Start</span>
        </>
      )}
    </Button>
  );
}
