-- =====================================================================
-- Bharat RealEstate: Fix Sequential Plot IDs & Prevent Gaps
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- =====================================================================

-- 1. Sync sequence with the current MAX(plot_no) in database
DO $$
DECLARE
  v_max BIGINT;
BEGIN
  SELECT COALESCE(MAX(plot_no), 0) INTO v_max FROM public.properties;
  IF v_max = 0 THEN
    PERFORM setval('public.property_plot_no_seq', 1, false);
  ELSE
    PERFORM setval('public.property_plot_no_seq', v_max, true);
  END IF;
END $$;

-- 2. Update Trigger to ensure plot_no always computes MAX(plot_no) + 1 on insert
-- This guarantees strictly sequential IDs (1, 2, 3... 13, 14, 15...) with zero gaps.
CREATE OR REPLACE FUNCTION public.set_property_plot_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_next_no BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.plot_no IS NULL THEN
      SELECT COALESCE(MAX(plot_no), 0) + 1 INTO v_next_no FROM public.properties;
      NEW.plot_no := v_next_no;
      PERFORM setval('public.property_plot_no_seq', v_next_no, true);
    END IF;
    NEW.plot_id := 'JSK-' || lpad(NEW.plot_no::text, 4, '0');
  ELSE
    -- Allow explicit update of plot_no and plot_id when fixing sequence
    IF NEW.plot_no IS DISTINCT FROM OLD.plot_no THEN
      NEW.plot_id := 'JSK-' || lpad(NEW.plot_no::text, 4, '0');
    ELSE
      NEW.plot_id := OLD.plot_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_property_plot_id ON public.properties;
CREATE TRIGGER trg_set_property_plot_id
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_property_plot_id();
