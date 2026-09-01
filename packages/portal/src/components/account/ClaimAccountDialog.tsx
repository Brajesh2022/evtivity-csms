// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

interface ClaimAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClaimAccountDialog({
  open,
  onOpenChange,
}: ClaimAccountDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const driver = useAuth((s) => s.driver);
  const claimAccount = useAuth((s) => s.claimAccount);

  const [firstName, setFirstName] = useState(
    driver?.firstName === 'Driver' || driver?.firstName === 'Guest' ? '' : (driver?.firstName ?? ''),
  );
  const [lastName, setLastName] = useState(driver?.lastName ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(driver?.phone ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.SyntheticEvent): Promise<void> {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError(t('validation.required', 'Please fill in all required fields.'));
      return;
    }
    if (password.length < 12) {
      setError(t('validation.passwordMin', 'Password must be at least 12 characters.'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: {
        email: string;
        password: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
      } = {
        email: email.trim(),
        password,
      };
      if (firstName.trim()) payload.firstName = firstName.trim();
      if (lastName.trim()) payload.lastName = lastName.trim();
      if (phone.trim()) payload.phone = phone.trim();

      await claimAccount(payload);
      onOpenChange(false);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t('auth.emailExists', 'This email is already registered.'));
      } else if (
        err instanceof ApiError &&
        err.body != null &&
        typeof err.body === 'object' &&
        'error' in err.body
      ) {
        setError(String((err.body as { error: string }).error));
      } else {
        setError(t('profile.profileUpdateFailed', 'Failed to save account. Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => {
          if (!loading) onOpenChange(false);
        }}
      />
      <div className="relative z-50 w-full max-w-md rounded-lg border bg-card p-6 shadow-lg space-y-4">
        <div>
          <h2 className="text-lg font-semibold">
            {t('account.saveAccountTitle', 'Save & Link Account')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              'account.saveAccountDesc',
              'Set an email and password to sync your charging sessions and payment methods across devices.',
            )}
          </p>
        </div>

        {error != null && <p className="text-sm text-destructive">{error}</p>}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="claimFirst" className="text-xs font-medium">
                {t('profile.firstName', 'First Name')}
              </label>
              <Input
                id="claimFirst"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="claimLast" className="text-xs font-medium">
                {t('profile.lastName', 'Last Name')}
              </label>
              <Input
                id="claimLast"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="claimEmail" className="text-xs font-medium">
              {t('profile.email', 'Email')} *
            </label>
            <Input
              id="claimEmail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="claimPassword" className="text-xs font-medium">
              {t('auth.password', 'Password')} * (min 12 chars)
            </label>
            <PasswordInput
              id="claimPassword"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="claimPhone" className="text-xs font-medium">
              {t('profile.phone', 'Phone')}
            </label>
            <Input
              id="claimPhone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1234567890"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Spinner className="mr-2 h-4 w-4" />}
              {t('account.saveAccountButton', 'Save Account')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
