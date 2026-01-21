-- Add 'owner' to the app_role enum in its own transaction
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';