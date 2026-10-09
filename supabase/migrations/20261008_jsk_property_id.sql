-- =====================================================================
-- Migration: Update Property ID format from 'P-XXXX' to 'JSK-XXXX'
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- =====================================================================

-- 1. Update the Trigger Function so newly created properties get 'JSK-' prefix
CREATE OR REPLACE FUNCTION public.set_property_plot_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.plot_no IS NULL THEN
      NEW.plot_no := nextval('public.property_plot_no_seq');
    END IF;
    NEW.plot_id := 'JSK-' || lpad(NEW.plot_no::text, 4, '0');
  ELSE
    -- Never allow altering plot_no or plot_id on update
    NEW.plot_no := OLD.plot_no;
    NEW.plot_id := OLD.plot_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. (Optional but Recommended) Update all existing records in database from P- to JSK-
UPDATE public.properties
SET plot_id = 'JSK-' || substring(plot_id from 3)
WHERE plot_id LIKE 'P-%';
