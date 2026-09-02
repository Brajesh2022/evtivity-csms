-- Copyright (c) 2024-2026 EVtivity. All rights reserved.
-- SPDX-License-Identifier: BUSL-1.1

-- Set system default currency to INR
UPDATE "settings" SET "value" = '"INR"' WHERE "key" = 'company.currency';
UPDATE "settings" SET "value" = '"INR"' WHERE "key" = 'pricing.currency';

-- Update all default tariffs to INR and standard Indian EV charging rates
UPDATE "tariffs"
SET 
  "currency" = 'INR',
  "price_per_kwh" = CASE 
    WHEN "id" = 'trf_seed00000001' THEN '14.00'
    WHEN "id" = 'trf_seed00000002' THEN '16.00'
    WHEN "id" = 'trf_seed00000003' THEN '10.00'
    WHEN "id" = 'trf_seed00000004' THEN '15.00'
    WHEN "id" = 'trf_seed00000005' THEN '12.00'
    WHEN "id" = 'trf_seed00000006' THEN '11.00'
    WHEN "id" = 'trf_seed00000007' THEN '18.00'
    WHEN "id" = 'trf_seed00000008' THEN '18.00'
    WHEN "id" = 'trf_seed00000009' THEN '22.00'
    WHEN "id" = 'trf_seed00000010' THEN '22.00'
    WHEN "id" = 'trf_seed00000011' THEN '16.00'
    WHEN "id" = 'trf_seed00000012' THEN '15.00'
    WHEN "id" = 'trf_seed00000013' THEN '24.00'
    WHEN "id" = 'trf_seed00000014' THEN '12.00'
    WHEN "id" = 'trf_seed00000015' THEN '10.00'
    WHEN "id" = 'trf_seed00000016' THEN '14.00'
    WHEN "id" = 'trf_seed00000017' THEN '11.00'
    WHEN "id" = 'trf_seed00000018' THEN '9.50'
    WHEN "id" = 'trf_seed00000023' THEN '16.00'
    WHEN "id" = 'trf_seed00000024' THEN '13.00'
    WHEN "id" = 'trf_seed00000025' THEN '19.00'
    WHEN "id" = 'trf_seed00000026' THEN '17.00'
    WHEN "id" = 'trf_seed00000027' THEN '20.00'
    WHEN "id" = 'trf_seed00000028' THEN '22.00'
    ELSE COALESCE("price_per_kwh", '18.00')
  END,
  "price_per_minute" = '0.00',
  "price_per_session" = '0.00',
  "idle_fee_price_per_minute" = '2.00',
  "tax_rate" = '0.18',
  "updated_at" = NOW()
WHERE "currency" = 'USD' OR "id" LIKE 'trf_seed%';
