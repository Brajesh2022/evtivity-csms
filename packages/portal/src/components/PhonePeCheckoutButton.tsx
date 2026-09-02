// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, Loader2, IndianRupee, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  buttonLabel?: string;
}

const PRESET_AMOUNTS = [100, 200, 300, 500, 1000];

export function PhonePeCheckoutButton({
  stationId,
  evseId,
  amountPaisa = 10000, // ₹100 default
  guestEmail,
  mobileNumber,
  onSuccess,
  onError,
  className,
  buttonLabel,
}: PhonePeCheckoutButtonProps): React.JSX.Element {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  
  const initialRupees = Math.max(10, Math.round(amountPaisa / 100));
  const [selectedRupees, setSelectedRupees] = useState<number>(initialRupees);
  const [customInput, setCustomInput] = useState<string>('');
  const [modalError, setModalError] = useState<string>('');

  function handleSelectPreset(amt: number): void {
    setSelectedRupees(amt);
    setCustomInput('');
    setModalError('');
  }

  function handleCustomChange(val: string): void {
    setCustomInput(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) {
      setSelectedRupees(num);
      setModalError('');
    }
  }

  async function handleProceedPayment(): Promise<void> {
    if (selectedRupees < 10) {
      setModalError('Minimum charging amount is ₹10');
      return;
    }
    if (selectedRupees > 50000) {
      setModalError('Maximum charging amount is ₹50,000');
      return;
    }

    setLoading(true);
    setModalError('');

    const targetPaisa = selectedRupees * 100;

    try {
      const payload = {
        stationId,
        evseId: Number(evseId),
        amountPaisa: targetPaisa,
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

      setShowModal(false);
      onSuccess?.();
    } catch (err: unknown) {
      const msg =
        err != null && typeof err === 'object' && 'body' in err
          ? String((err as { body: { error?: string } }).body.error ?? 'Payment failed')
          : 'Failed to initiate PhonePe payment';
      setModalError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        className={`w-full gap-2 bg-[#5f259f] hover:bg-[#4d1e82] text-white font-medium py-3 rounded-lg shadow-sm transition-all ${className ?? ''}`}
        size="lg"
        onClick={() => {
          setShowModal(true);
        }}
      >
        <Zap className="h-4 w-4 fill-current text-yellow-300" />
        <span>{buttonLabel ?? `Pay with PhonePe / UPI & Start`}</span>
      </Button>

      {/* Amount Selection Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => {
              if (!loading) setShowModal(false);
            }}
          />
          <div className="relative z-50 w-full max-w-sm rounded-xl border bg-card p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-1 border-b">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5f259f]/10 text-[#5f259f]">
                  <Zap className="h-4 w-4 fill-current" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Enter Charging Amount</h3>
                  <p className="text-xs text-muted-foreground">Select or type advance amount</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full"
                disabled={loading}
                onClick={() => setShowModal(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Quick Preset Chips */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Quick Select</label>
              <div className="grid grid-cols-5 gap-1.5">
                {PRESET_AMOUNTS.map((amt) => {
                  const isSelected = selectedRupees === amt && customInput === '';
                  return (
                    <button
                      key={amt}
                      type="button"
                      disabled={loading}
                      className={`py-2 px-1 text-center rounded-lg text-xs font-semibold border transition-all ${
                        isSelected
                          ? 'border-[#5f259f] bg-[#5f259f] text-white shadow-sm'
                          : 'border-input bg-background hover:bg-accent text-foreground'
                      }`}
                      onClick={() => handleSelectPreset(amt)}
                    >
                      ₹{amt}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Amount Input */}
            <div className="space-y-1.5">
              <label htmlFor="custom-amount" className="text-xs font-medium text-muted-foreground">
                Or Enter Custom Amount (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
                  ₹
                </span>
                <Input
                  id="custom-amount"
                  type="number"
                  min="10"
                  max="50000"
                  step="10"
                  placeholder="e.g. 250"
                  className="pl-7 text-base font-medium"
                  value={customInput}
                  disabled={loading}
                  onChange={(e) => handleCustomChange(e.target.value)}
                />
              </div>
            </div>

            {/* Auto Refund Guarantee Callout */}
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-snug text-emerald-700 dark:text-emerald-300">
                <span className="font-semibold">Auto-Refund Guarantee:</span> You are only charged for energy actually consumed. Unused balance is refunded to your UPI account when unplugged.
              </div>
            </div>

            {modalError !== '' && (
              <p className="text-xs text-destructive bg-destructive/10 p-2 rounded-md font-medium">
                {modalError}
              </p>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <Button
                type="button"
                className="w-full gap-2 bg-[#5f259f] hover:bg-[#4d1e82] text-white font-medium py-3 rounded-lg shadow-sm"
                size="lg"
                disabled={loading || selectedRupees < 10}
                onClick={() => void handleProceedPayment()}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Connecting to UPI...</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 fill-current text-yellow-300" />
                    <span>Pay ₹{selectedRupees} & Start Charging</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
