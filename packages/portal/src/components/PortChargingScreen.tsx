// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  Loader2,
  MapPin,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthBranding } from '@/components/AuthBranding';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatConnectorType } from '@/lib/charger-utils';
import type { PricingInfo } from '@/components/PricingDisplay';

export interface ConnectorDetail {
  connectorId: number;
  connectorType: string | null;
  maxPowerKw: number | string | null;
  maxCurrentAmps: number | null;
  status: string;
}

export interface PortChargingScreenProps {
  station: {
    stationId: string;
    siteId?: string | null | undefined;
    siteName?: string | null | undefined;
    siteAddress?: string | null | undefined;
    siteCity?: string | null | undefined;
    siteState?: string | null | undefined;
    hoursOfOperation?: string | null | undefined;
    isOnline: boolean;
    paymentEnabled?: boolean | undefined;
    phonepeEnabled?: boolean | undefined;
    phonepePreAuthPaisa?: number | undefined;
    maintenance?: { active: boolean; plannedEndAt: string | null; message: string | null } | null | undefined;
  };
  evse: {
    evseId: number;
    connectors: ConnectorDetail[];
    reservationExpiresAt?: string | null | undefined;
  };
  pricing?: PricingInfo | null | undefined;
  onBack: () => void;
  isFree?: boolean | undefined;
  onStartFree?: (() => Promise<void>) | undefined;
  isStartingFree?: boolean | undefined;
  guestEmail?: string | undefined;
  mobileNumber?: string | undefined;
}

const PRESET_AMOUNTS = [100, 200, 500, 1000];

export function PortChargingScreen({
  station,
  evse,
  pricing,
  onBack,
  isFree = false,
  onStartFree,
  isStartingFree = false,
  guestEmail,
  mobileNumber,
}: PortChargingScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const { companyName, companyLogo } = useAuthBranding();

  // Selected or typed amount in rupees
  const defaultAmount =
    station.phonepePreAuthPaisa != null
      ? Math.max(10, Math.round(station.phonepePreAuthPaisa / 100))
      : 100;
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [amountStr, setAmountStr] = useState<string>(String(defaultAmount));

  // Dropdown states
  const [isHoursOpen, setIsHoursOpen] = useState(false);
  const [isRateExpanded, setIsRateExpanded] = useState(false);

  // Bottom sheet state
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'upi' | 'card'>('upi');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string>('');

  // Rate formatting
  const ratePerKwh =
    pricing?.pricePerKwh != null ? Number(pricing.pricePerKwh) : isFree ? 0 : 22;
  const idleFee =
    pricing?.idleFeePricePerMinute != null ? Number(pricing.idleFeePricePerMinute) : 2;
  const taxRatePercent =
    pricing?.taxRate != null ? Math.round(Number(pricing.taxRate) * 100) : 18;
  const sessionFee =
    pricing?.pricePerSession != null ? Number(pricing.pricePerSession) : 0;

  // Connector details
  const primaryConnector = evse.connectors[0];
  const connectorType = primaryConnector?.connectorType
    ? formatConnectorType(primaryConnector.connectorType)
    : 'CCS2';
  const powerKw = primaryConnector?.maxPowerKw ? Number(primaryConnector.maxPowerKw) : 150;

  // Organization branding / initials
  const displayName = companyName || 'ACEIT Mobility';
  const initials =
    displayName
      .split(' ')
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'BK';

  function handlePresetClick(amt: number): void {
    setAmount(amt);
    setAmountStr(String(amt));
    setPaymentError('');
  }

  function handleAmountInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setAmountStr(val);
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      setAmount(num);
      setPaymentError('');
    } else {
      setAmount(0);
    }
  }

  async function handleProceedPayment(): Promise<void> {
    if (isFree) {
      if (onStartFree) {
        await onStartFree();
      }
      return;
    }

    if (amount < 10) {
      setPaymentError('Minimum charging amount is ₹10');
      return;
    }
    if (amount > 50000) {
      setPaymentError('Maximum charging amount is ₹50,000');
      return;
    }

    setIsSubmittingPayment(true);
    setPaymentError('');

    try {
      const targetPaisa = amount * 100;
      const payload = {
        stationId: station.stationId,
        evseId: evse.evseId,
        amountPaisa: targetPaisa,
        guestEmail,
        mobileNumber,
        redirectUrl: `${window.location.origin}/charge/${station.stationId}/${String(evse.evseId)}`,
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
    } catch (err: unknown) {
      if (err != null && typeof err === 'object' && 'body' in err) {
        const body = (err as { body: { error?: string } }).body;
        setPaymentError(body.error ?? 'Payment initiation failed. Please try again.');
      } else {
        setPaymentError('Payment initiation failed. Please try again.');
      }
      setIsSubmittingPayment(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background text-foreground flex flex-col justify-between overflow-y-auto overscroll-none">
      {/* Scrollable Main Content */}
      <div className="w-full max-w-md mx-auto px-4 pt-3 pb-6 flex-1 flex flex-col">
        {/* Top Navigation Row */}
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 rounded-full hover:bg-muted text-foreground transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
        </div>

        {/* Avatar & Brand Header */}
        <div className="flex flex-col items-center text-center mb-5">
          {companyLogo ? (
            <img
              src={companyLogo}
              alt={displayName}
              className="w-16 h-16 rounded-full object-contain border border-emerald-200 shadow-sm mb-2 bg-white p-1.5"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#dcfce7] dark:bg-emerald-950/60 text-[#15803d] dark:text-emerald-400 font-semibold text-xl flex items-center justify-center border border-[#bbf7d0] dark:border-emerald-800 shadow-xs mb-2">
              {initials}
            </div>
          )}

          <span className="text-[11px] text-muted-foreground font-medium mb-0.5">Paying</span>
          <h1 className="text-xl font-bold tracking-tight text-foreground leading-tight">{displayName}</h1>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            {station.stationId} • {station.siteName || 'Downtown Fast Charging Hub'}
          </p>

          {/* Location Pill */}
          {station.siteAddress && (
            station.siteId ? (
              <Link
                to={`/location/${station.siteId}?from=${encodeURIComponent(window.location.pathname)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border/80 bg-card text-xs text-foreground shadow-2xs hover:bg-muted/60 transition-colors"
              >
                <MapPin className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate max-w-[280px]">
                  {station.siteAddress}
                  {station.siteCity ? `, ${station.siteCity}` : ''}
                  {station.siteState ? `, ${station.siteState}` : ''}
                </span>
              </Link>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border/80 bg-card text-xs text-foreground shadow-2xs">
                <MapPin className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate max-w-[280px]">
                  {station.siteAddress}
                  {station.siteCity ? `, ${station.siteCity}` : ''}
                  {station.siteState ? `, ${station.siteState}` : ''}
                </span>
              </div>
            )
          )}
        </div>

        {/* Status & Port Info Card */}
        <div className="w-full bg-card border border-border/80 rounded-2xl p-3 shadow-xs mb-4">
          <div className="flex items-center justify-between">
            {/* Online Dropdown Button */}
            <button
              type="button"
              onClick={() => setIsHoursOpen((prev) => !prev)}
              className="flex items-center gap-1.5 pl-2 text-sm font-medium hover:opacity-80 transition-opacity cursor-pointer"
            >
              <span className={cn('h-2.5 w-2.5 rounded-full', station.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-destructive')} />
              <span>{station.isOnline ? 'Online' : 'Offline'}</span>
              {isHoursOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {/* Vertical Divider */}
            <div className="h-5 w-px bg-border/80 mx-2" />

            {/* Port Information */}
            <div className="flex items-center gap-1.5 pr-2 text-sm font-medium text-foreground">
              <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                {connectorType} • {powerKw} kW • Port {evse.evseId}
              </span>
            </div>
          </div>

          {/* Working Hours Dropdown Accordion */}
          {isHoursOpen && (
            <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground space-y-1.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between font-medium text-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-emerald-600" /> Operating Schedule
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {station.hoursOfOperation || (station.isOnline ? '24 Hours Open (24/7)' : 'Offline')}
                </span>
              </div>
              {station.hoursOfOperation ? (
                <p className="whitespace-pre-line">{station.hoursOfOperation}</p>
              ) : (
                <>
                  <p>• {station.isOnline ? 'Station is operational and ready for charging' : 'Station is currently offline'}</p>
                  <p>• Dynamic power delivery up to {powerKw} kW ({connectorType})</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Amount Input Hero Area */}
        <div className="flex flex-col items-center text-center my-3">
          <label htmlFor="charge-amount-input" className="text-xs text-muted-foreground font-medium mb-1">
            Enter amount
          </label>

          <div className="flex items-center justify-center relative">
            <span className="text-4xl font-bold text-emerald-600 dark:text-emerald-400 mr-2 select-none">
              ₹
            </span>
            <input
              id="charge-amount-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={amountStr}
              onChange={handleAmountInputChange}
              className="text-5xl sm:text-6xl font-semibold tracking-tight text-foreground bg-transparent border-none outline-none text-center w-44 sm:w-56 focus:ring-0 p-0"
              placeholder="100"
            />
          </div>
          <div className="h-0.5 w-44 sm:w-56 bg-emerald-600 dark:bg-emerald-400 mt-1 rounded-full opacity-80" />

          {/* Rate Pill Dropdown Button */}
          <button
            type="button"
            onClick={() => setIsRateExpanded((prev) => !prev)}
            className="mt-3 inline-flex items-center gap-1 px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-all cursor-pointer"
          >
            <span>Rate: ₹{ratePerKwh.toFixed(2)} / kWh</span>
            {isRateExpanded ? (
              <ChevronUp className="h-3 w-3 text-emerald-700 dark:text-emerald-300" />
            ) : (
              <ChevronDown className="h-3 w-3 text-emerald-700 dark:text-emerald-300" />
            )}
          </button>

          {/* Inline Rate Breakdown Accordion */}
          {isRateExpanded && (
            <div className="w-full max-w-sm mt-3 p-3 rounded-xl bg-card border border-border/80 text-xs text-left space-y-1.5 shadow-2xs animate-in fade-in duration-200">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Energy Consumption:</span>
                <span className="font-semibold text-foreground">₹{ratePerKwh.toFixed(2)} / kWh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Applicable Tax:</span>
                <span className="font-semibold text-foreground">{taxRatePercent}% GST</span>
              </div>
              {idleFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Idle Fee (after 10m grace):</span>
                  <span className="font-semibold text-foreground">₹{idleFee.toFixed(2)} / min</span>
                </div>
              )}
              {sessionFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Session Base Fee:</span>
                  <span className="font-semibold text-foreground">₹{sessionFee.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-1.5 border-t border-border/60 text-muted-foreground text-[11px]">
                🛡️ You are billed strictly for consumed kWh. Any unused advance balance is auto-refunded to your UPI bank.
              </div>
            </div>
          )}
        </div>

        {/* Suggested Amounts Divider & Chips */}
        <div className="w-full max-w-sm mx-auto my-3">
          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-border/70" />
            <span className="flex-shrink mx-3 text-xs text-muted-foreground font-normal">
              Suggested amounts
            </span>
            <div className="flex-grow border-t border-border/70" />
          </div>

          <div className="grid grid-cols-4 gap-2 mt-1">
            {PRESET_AMOUNTS.map((amt) => {
              const isSelected = amount === amt;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handlePresetClick(amt)}
                  className={cn(
                    'py-2 px-1 rounded-full text-xs sm:text-sm font-semibold border transition-all text-center cursor-pointer shadow-2xs',
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-200 ring-1 ring-emerald-500/30'
                      : 'border-border/80 bg-card text-foreground hover:bg-muted/60',
                  )}
                >
                  ₹{amt}
                </button>
              );
            })}
          </div>
        </div>

        {/* Information Notice Banner */}
        <div className="w-full max-w-sm mx-auto rounded-xl bg-[#ecfdf5] dark:bg-emerald-950/40 border border-[#a7f3d0] dark:border-emerald-900/60 p-3.5 flex items-start gap-3 mt-3 mb-2 shadow-2xs">
          <Info className="h-5 w-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-950 dark:text-emerald-200 leading-relaxed font-normal">
            You will be charged based on the energy (kWh) delivered until you stop the charging session.
          </p>
        </div>
      </div>

      {/* Sticky Bottom Pay CTA Button Bar */}
      <div className="sticky bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-md pt-2 pb-6 px-4 border-t border-border/30">
        <div className="w-full max-w-md mx-auto">
          <Button
            type="button"
            onClick={() => {
              if (isFree) {
                void handleProceedPayment();
              } else {
                setIsBottomSheetOpen(true);
              }
            }}
            disabled={isStartingFree || isSubmittingPayment || !station.isOnline}
            className="w-full h-12 rounded-xl bg-[#064e3b] hover:bg-[#065f46] active:bg-[#022c22] text-white font-semibold text-base shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {isStartingFree || isSubmittingPayment ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <Zap className="h-5 w-5 fill-current" />
                <span>Pay & Start Charging</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Payment Selection Bottom Sheet (Android Style, No Popups) */}
      {isBottomSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
          <div
            className="w-full max-w-md bg-card border-t border-border/80 rounded-t-3xl p-5 shadow-2xl animate-in slide-in-from-bottom-10 duration-300 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Handle Bar */}
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto" />

            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <h3 className="text-lg font-bold text-foreground">Select Payment Method</h3>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                Deposit: ₹{amount}
              </span>
            </div>

            {paymentError && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs font-medium">
                {paymentError}
              </div>
            )}

            {/* UPI Option Card (Pre-selected) */}
            <div
              onClick={() => setSelectedPaymentMethod('upi')}
              className={cn(
                'p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3.5',
                selectedPaymentMethod === 'upi'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30'
                  : 'border-border bg-card',
              )}
            >
              <div className="mt-0.5">
                <div className="h-5 w-5 rounded-full border-2 border-emerald-600 flex items-center justify-center">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                </div>
              </div>

              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                    Pay via UPI (PhonePe / GPay / Paytm)
                  </span>
                  <span className="text-[10px] uppercase font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 px-2 py-0.5 rounded-full">
                    Instant
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Direct app-to-app payment. Unused amount refunded immediately to your UPI bank.
                </p>
              </div>
            </div>

            {/* Auto-refund guarantee badge */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/60 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Auto-Refund Guarantee: You are only charged for actual kWh delivered.</span>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <Button
                type="button"
                onClick={handleProceedPayment}
                disabled={isSubmittingPayment}
                className="w-full h-12 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-base shadow-sm flex items-center justify-center gap-2"
              >
                {isSubmittingPayment ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Initiating UPI...</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 fill-current" />
                    <span>Proceed to Pay ₹{amount}</span>
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setIsBottomSheetOpen(false);
                  setPaymentError('');
                }}
                disabled={isSubmittingPayment}
                className="w-full h-10 rounded-xl text-muted-foreground hover:text-foreground text-sm font-medium"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
