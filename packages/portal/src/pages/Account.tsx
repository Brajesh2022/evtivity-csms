// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  User,
  ShieldCheck,
  BellRing,
  LayoutGrid,
  CreditCard,
  Nfc,
  Car,
  Star,
  LifeBuoy,
  ChevronRight,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { ClaimAccountDialog } from '@/components/account/ClaimAccountDialog';

interface RowProps {
  icon: React.ReactNode;
  title: string;
  to: string;
  divider?: boolean;
}

function Row({ icon, title, to, divider }: RowProps): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        void navigate(to);
      }}
      className={`flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-accent ${
        divider ? 'border-t border-border' : ''
      }`}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 text-sm font-medium">{title}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

export function Account(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const driver = useAuth((s) => s.driver);
  const logout = useAuth((s) => s.logout);
  const [showClaimDialog, setShowClaimDialog] = useState(false);

  const isGuest = driver?.email == null || driver.registrationSource === 'device';
  const fullName =
    driver != null && driver.firstName !== 'Driver' && driver.firstName !== 'Guest'
      ? `${driver.firstName} ${driver.lastName}`.trim()
      : isGuest
        ? t('account.guestAccount', 'Guest Driver')
        : '';

  function handleLogout(): void {
    void logout();
    void navigate('/login');
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{fullName.length > 0 ? fullName : t('account.title')}</h1>
        {driver?.email != null ? (
          <p className="text-sm text-muted-foreground">{driver.email}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t('account.deviceBound', 'Device-bound profile')}
          </p>
        )}
      </div>

      {isGuest && (
        <Card className="border-primary/40 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-primary shrink-0" />
            <div className="flex-1 space-y-1">
              <h3 className="text-sm font-semibold">
                {t('account.guestTitle', 'Instant Guest Mode')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t(
                  'account.guestDesc',
                  'You are using ACEIT Mobility without signing in. Save your account to sync charging history and cards across devices.',
                )}
              </p>
              <div className="pt-2">
                <Button size="sm" onClick={() => setShowClaimDialog(true)}>
                  {t('account.saveAccount', 'Save / Link Account')}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <ClaimAccountDialog open={showClaimDialog} onOpenChange={setShowClaimDialog} />

      <Card className="overflow-hidden p-0">
        <Row
          icon={<User className="h-5 w-5" />}
          title={t('account.personalInfo')}
          to="/account/personal"
        />
        <Row
          icon={<ShieldCheck className="h-5 w-5" />}
          title={t('account.security')}
          to="/account/security"
          divider
        />
        <Row
          icon={<BellRing className="h-5 w-5" />}
          title={t('account.notificationPrefs')}
          to="/account/notifications"
          divider
        />
        <Row
          icon={<LayoutGrid className="h-5 w-5" />}
          title={t('account.homeScreen')}
          to="/account/home-cards"
          divider
        />
      </Card>

      <Card className="overflow-hidden p-0">
        <Row
          icon={<CreditCard className="h-5 w-5" />}
          title={t('account.paymentMethods')}
          to="/payment-methods"
        />
        <Row
          icon={<Nfc className="h-5 w-5" />}
          title={t('account.rfidCards')}
          to="/rfid-cards"
          divider
        />
        <Row
          icon={<Car className="h-5 w-5" />}
          title={t('account.vehicles')}
          to="/vehicles"
          divider
        />
      </Card>

      <Card className="overflow-hidden p-0">
        <Row icon={<Star className="h-5 w-5" />} title={t('favorites.title')} to="/favorites" />
        <Row
          icon={<LifeBuoy className="h-5 w-5" />}
          title={t('account.supportCases')}
          to="/support"
          divider
        />
      </Card>

      <Button variant="outline" size="lg" className="w-full" onClick={handleLogout}>
        <LogOut className="mr-2 h-4 w-4" />
        {t('profile.signOut')}
      </Button>
    </div>
  );
}
