-- =====================================================================
-- Bharat RealEstate Migration: Sequential IDs, Broker Support & Status Update
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- =====================================================================

-- 1. Add is_broker column to public.properties if not exists
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS is_broker BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Update status constraint to allow 'not_interested'
ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_status_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_status_check
  CHECK (status IN ('available', 'sold', 'hold', 'not_interested'));

-- 3. Synchronize Sequence: Ensure plot_no sequence is strictly sequential and unique
-- Set sequence to MAX(plot_no) + 1 (or 1 if no properties exist)
DO $$
DECLARE
  v_max BIGINT;
BEGIN
  SELECT COALESCE(MAX(plot_no), 0) INTO v_max FROM public.properties;
  IF v_max = 0 THEN
    PERFORM setval('public.property_plot_no_seq', 1, false);
  ELSE
    PERFORM setval('public.property_plot_no_seq', v_max + 1, false);
  END IF;
END $$;

-- 4. Update Trigger to ensure plot_no and plot_id are always sequential and formatted JSK-XXXX
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
    NEW.plot_no := OLD.plot_no;
    NEW.plot_id := OLD.plot_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Update create_property RPC with optional p_is_broker support
CREATE OR REPLACE FUNCTION public.create_property(
  p_sector_id UUID,
  p_location TEXT,
  p_house_no TEXT,
  p_price BIGINT,
  p_type_id UUID,
  p_area_size NUMERIC,
  p_area_unit TEXT,
  p_details TEXT,
  p_status TEXT,
  p_contact_name TEXT,
  p_phone TEXT,
  p_is_broker BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  plot_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_property_id UUID;
  v_plot_id TEXT;
  v_clean_phone TEXT;
BEGIN
  v_clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF length(v_clean_phone) = 12 AND v_clean_phone LIKE '91%' THEN
    v_clean_phone := substr(v_clean_phone, 3);
  ELSIF length(v_clean_phone) = 11 AND v_clean_phone LIKE '0%' THEN
    v_clean_phone := substr(v_clean_phone, 2);
  END IF;

  IF v_clean_phone !~ '^[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'Invalid phone number format: %', p_phone;
  END IF;

  INSERT INTO public.properties (
    sector_id, location, house_no, price, type_id, area_size, area_unit, details, status, is_broker
  )
  VALUES (
    p_sector_id, COALESCE(trim(p_location), ''), NULLIF(trim(p_house_no), ''), p_price, p_type_id,
    p_area_size, NULLIF(trim(p_area_unit), ''), NULLIF(trim(p_details), ''),
    COALESCE(p_status, 'available'), COALESCE(p_is_broker, false)
  )
  RETURNING properties.id, properties.plot_id INTO v_property_id, v_plot_id;

  INSERT INTO public.property_contacts (property_id, contact_name, phone)
  VALUES (v_property_id, NULLIF(trim(p_contact_name), ''), v_clean_phone);

  RETURN QUERY SELECT v_property_id, v_plot_id;
END;
$$;

-- 6. Update update_property RPC with optional p_is_broker support
CREATE OR REPLACE FUNCTION public.update_property(
  p_id UUID,
  p_sector_id UUID,
  p_location TEXT,
  p_house_no TEXT,
  p_price BIGINT,
  p_type_id UUID,
  p_area_size NUMERIC,
  p_area_unit TEXT,
  p_details TEXT,
  p_status TEXT,
  p_contact_name TEXT,
  p_phone TEXT,
  p_is_broker BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clean_phone TEXT;
BEGIN
  v_clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF length(v_clean_phone) = 12 AND v_clean_phone LIKE '91%' THEN
    v_clean_phone := substr(v_clean_phone, 3);
  ELSIF length(v_clean_phone) = 11 AND v_clean_phone LIKE '0%' THEN
    v_clean_phone := substr(v_clean_phone, 2);
  END IF;

  IF v_clean_phone !~ '^[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'Invalid phone number format: %', p_phone;
  END IF;

  UPDATE public.properties
  SET
    sector_id = p_sector_id,
    location = COALESCE(trim(p_location), ''),
    house_no = NULLIF(trim(p_house_no), ''),
    price = p_price,
    type_id = p_type_id,
    area_size = p_area_size,
    area_unit = NULLIF(trim(p_area_unit), ''),
    details = NULLIF(trim(p_details), ''),
    status = COALESCE(p_status, status),
    is_broker = COALESCE(p_is_broker, is_broker)
  WHERE id = p_id AND is_deleted = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found or deleted';
  END IF;

  INSERT INTO public.property_contacts (property_id, contact_name, phone)
  VALUES (p_id, NULLIF(trim(p_contact_name), ''), v_clean_phone)
  ON CONFLICT (property_id) DO UPDATE
  SET
    contact_name = EXCLUDED.contact_name,
    phone = EXCLUDED.phone;

  RETURN TRUE;
END;
$$;

-- 7. Update get_property_for_edit to include is_broker
CREATE OR REPLACE FUNCTION public.get_property_for_edit(p_id UUID)
RETURNS TABLE (
  id UUID,
  plot_no BIGINT,
  plot_id TEXT,
  sector_id UUID,
  sector_name TEXT,
  location TEXT,
  house_no TEXT,
  price BIGINT,
  type_id UUID,
  type_name TEXT,
  area_size NUMERIC,
  area_unit TEXT,
  details TEXT,
  status TEXT,
  is_broker BOOLEAN,
  contact_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.plot_no,
    p.plot_id,
    p.sector_id,
    s.name AS sector_name,
    p.location,
    p.house_no,
    p.price,
    p.type_id,
    t.name AS type_name,
    p.area_size,
    p.area_unit,
    p.details,
    p.status,
    p.is_broker,
    c.contact_name,
    c.phone,
    p.created_at,
    p.updated_at
  FROM public.properties p
  JOIN public.sectors s ON s.id = p.sector_id
  JOIN public.property_types t ON t.id = p.type_id
  LEFT JOIN public.property_contacts c ON c.property_id = p.id
  WHERE p.id = p_id AND p.is_deleted = FALSE;
END;
$$;

-- 8. Update search_properties to include is_broker
CREATE OR REPLACE FUNCTION public.search_properties(
  p_min_price BIGINT DEFAULT NULL,
  p_max_price BIGINT DEFAULT NULL,
  p_sector_ids UUID[] DEFAULT NULL,
  p_type_ids UUID[] DEFAULT NULL,
  p_plot_id TEXT DEFAULT NULL,
  p_statuses TEXT[] DEFAULT ARRAY['available'],
  p_include_phone BOOLEAN DEFAULT FALSE,
  p_sort TEXT DEFAULT 'newest',
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  plot_no BIGINT,
  plot_id TEXT,
  sector_id UUID,
  sector_name TEXT,
  location TEXT,
  house_no TEXT,
  price BIGINT,
  type_id UUID,
  type_name TEXT,
  area_size NUMERIC,
  area_unit TEXT,
  details TEXT,
  status TEXT,
  is_broker BOOLEAN,
  contact_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_normalized_plot_id TEXT := NULL;
  v_numeric_plot_no BIGINT := NULL;
BEGIN
  IF p_plot_id IS NOT NULL AND trim(p_plot_id) <> '' THEN
    v_normalized_plot_id := upper(trim(p_plot_id));
    IF v_normalized_plot_id ~ '^[0-9]+$' THEN
      v_numeric_plot_no := v_normalized_plot_id::BIGINT;
    ELSIF v_normalized_plot_id ~ '^JSK-?[0-9]+$' THEN
      v_numeric_plot_no := regexp_replace(v_normalized_plot_id, '^JSK-?', '', 'i')::BIGINT;
    ELSIF v_normalized_plot_id ~ '^P-?[0-9]+$' THEN
      v_numeric_plot_no := regexp_replace(v_normalized_plot_id, '^P-?', '', 'i')::BIGINT;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.plot_no,
    p.plot_id,
    p.sector_id,
    s.name AS sector_name,
    p.location,
    p.house_no,
    p.price,
    p.type_id,
    t.name AS type_name,
    p.area_size,
    p.area_unit,
    p.details,
    p.status,
    p.is_broker,
    CASE WHEN p_include_phone THEN c.contact_name ELSE NULL END AS contact_name,
    CASE WHEN p_include_phone THEN c.phone ELSE NULL END AS phone,
    p.created_at,
    COUNT(*) OVER() AS total_count
  FROM public.properties p
  JOIN public.sectors s ON s.id = p.sector_id
  JOIN public.property_types t ON t.id = p.type_id
  LEFT JOIN public.property_contacts c ON (p_include_phone AND c.property_id = p.id)
  WHERE p.is_deleted = FALSE
    AND (p_min_price IS NULL OR p.price >= p_min_price)
    AND (p_max_price IS NULL OR p.price <= p_max_price)
    AND (p_sector_ids IS NULL OR cardinality(p_sector_ids) = 0 OR p.sector_id = ANY(p_sector_ids))
    AND (p_type_ids IS NULL OR cardinality(p_type_ids) = 0 OR p.type_id = ANY(p_type_ids))
    AND (p_statuses IS NULL OR cardinality(p_statuses) = 0 OR p.status = ANY(p_statuses))
    AND (
      v_normalized_plot_id IS NULL
      OR (v_numeric_plot_no IS NOT NULL AND p.plot_no = v_numeric_plot_no)
      OR upper(p.plot_id) = v_normalized_plot_id
      OR upper(p.plot_id) LIKE '%' || v_normalized_plot_id || '%'
    )
  ORDER BY
    CASE WHEN p_sort = 'price_asc' THEN p.price END ASC,
    CASE WHEN p_sort = 'price_desc' THEN p.price END DESC,
    CASE WHEN p_sort = 'oldest' THEN p.created_at END ASC,
    p.created_at DESC,
    p.id DESC
  LIMIT COALESCE(p_limit, 20)
  OFFSET COALESCE(p_offset, 0);
END;
$$;

-- Grant permissions to anon and authenticated
GRANT EXECUTE ON FUNCTION public.create_property TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_property TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_property_for_edit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_properties TO anon, authenticated;
