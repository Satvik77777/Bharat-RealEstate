-- =====================================================================
-- Bharat RealEstate Migration: Resequence Property IDs & Delete-to-Sold
-- Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- =====================================================================

-- 1. Resequence all existing properties strictly from 1 in order of creation
DO $$
DECLARE
  r RECORD;
  v_seq INT := 1;
BEGIN
  -- Disable trigger temporarily to allow direct update of plot_no & plot_id
  ALTER TABLE public.properties DISABLE TRIGGER trg_set_property_plot_id;

  FOR r IN (
    SELECT id FROM public.properties 
    ORDER BY created_at ASC
  ) LOOP
    UPDATE public.properties
    SET
      plot_no = v_seq,
      plot_id = 'JSK-' || lpad(v_seq::text, 4, '0')
    WHERE id = r.id;
    v_seq := v_seq + 1;
  END LOOP;

  -- Re-enable the trigger
  ALTER TABLE public.properties ENABLE TRIGGER trg_set_property_plot_id;

  -- Set sequence to the next number so new properties continue the sequence
  PERFORM setval('public.property_plot_no_seq', v_seq, false);
END $$;

-- 2. Update set_property_plot_id trigger function
-- Ensures new properties get nextval sequentially, and allows resequencing updates
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
    -- If plot_no is explicitly provided and changed, allow it
    IF NEW.plot_no IS NOT NULL AND NEW.plot_no <> OLD.plot_no THEN
      NEW.plot_id := 'JSK-' || lpad(NEW.plot_no::text, 4, '0');
    ELSE
      NEW.plot_no := OLD.plot_no;
      NEW.plot_id := OLD.plot_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Resequence stored procedure (can be executed anytime to defragment sequences)
CREATE OR REPLACE FUNCTION public.resequence_properties()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r RECORD;
  v_seq INT := 1;
BEGIN
  FOR r IN (
    SELECT id FROM public.properties 
    ORDER BY created_at ASC
  ) LOOP
    UPDATE public.properties
    SET
      plot_no = v_seq,
      plot_id = 'JSK-' || lpad(v_seq::text, 4, '0')
    WHERE id = r.id;
    v_seq := v_seq + 1;
  END LOOP;

  PERFORM setval('public.property_plot_no_seq', v_seq, false);
  RETURN v_seq - 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resequence_properties() TO anon, authenticated;
