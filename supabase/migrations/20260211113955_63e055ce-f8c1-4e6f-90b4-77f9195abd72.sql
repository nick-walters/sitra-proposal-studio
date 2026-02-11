
-- Phase 1a: Add coordinator to enum (must be committed separately)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coordinator';
