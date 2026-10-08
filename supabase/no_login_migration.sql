-- =====================================================================
-- COMPLETE DIRECT-ACCESS (NO LOGIN REQUIRED) MIGRATION
-- Run this in Supabase SQL Editor to enable all features without login
-- =====================================================================

-- 1. Table Grants & Full Access Policies for Anonymous Client
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sectors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_types TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_contacts TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

DROP POLICY IF EXISTS "anon_sectors_all" ON public.sectors;
CREATE POLICY "anon_sectors_all" ON public.sectors FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "anon_types_all" ON public.property_types;
CREATE POLICY "anon_types_all" ON public.property_types FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "anon_properties_all" ON public.properties;
CREATE POLICY "anon_properties_all" ON public.properties FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "anon_buyers_all" ON public.buyers;
CREATE POLICY "anon_buyers_all" ON public.buyers FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "anon_contacts_all" ON public.property_contacts;
CREATE POLICY "anon_contacts_all" ON public.property_contacts FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);

-- 2. Allow is_deleted update without admin auth requirement
CREATE OR REPLACE FUNCTION public.check_is_deleted_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN NEW;
END;
$$;

-- 3. Search Properties without auth requirement
CREATE OR REPLACE FUNCTION public.search_properties(
  p_min_price BIGINT DEFAULT NULL,
  p_max_price BIGINT DEFAULT NULL,
  p_sector_ids UUID[] DEFAULT NULL,
  p_type_ids UUID[] DEFAULT NULL,
  p_statuses TEXT[] DEFAULT NULL,
  p_plot_id TEXT DEFAULT NULL,
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

-- 4. Create Property without auth requirement
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
  p_phone TEXT
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
    sector_id, location, house_no, price, type_id, area_size, area_unit, details, status
  )
  VALUES (
    p_sector_id, COALESCE(trim(p_location), ''), NULLIF(trim(p_house_no), ''), p_price, p_type_id,
    p_area_size, NULLIF(trim(p_area_unit), ''), NULLIF(trim(p_details), ''),
    COALESCE(p_status, 'available')
  )
  RETURNING properties.id, properties.plot_id INTO v_property_id, v_plot_id;

  INSERT INTO public.property_contacts (property_id, contact_name, phone)
  VALUES (v_property_id, NULLIF(trim(p_contact_name), ''), v_clean_phone);

  RETURN QUERY SELECT v_property_id, v_plot_id;
END;
$$;

-- 5. Update Property without auth requirement
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
  p_phone TEXT
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
    status = COALESCE(p_status, status)
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

-- 6. Get Property For Edit
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

-- 7. Soft Delete Property & Buyer
CREATE OR REPLACE FUNCTION public.soft_delete_property(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.properties
  SET is_deleted = TRUE
  WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_buyer(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.buyers
  SET is_deleted = TRUE
  WHERE id = p_id;
  RETURN FOUND;
END;
$$;

-- 8. Phone Exists Duplicate Check
CREATE OR REPLACE FUNCTION public.phone_exists(
  p_phone TEXT,
  p_exclude_property_id UUID DEFAULT NULL
)
RETURNS TABLE (
  plot_id TEXT,
  location TEXT,
  status TEXT
)
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

  IF v_clean_phone = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.plot_id,
    p.location,
    p.status
  FROM public.property_contacts c
  JOIN public.properties p ON p.id = c.property_id
  WHERE c.phone = v_clean_phone
    AND p.is_deleted = FALSE
    AND (p_exclude_property_id IS NULL OR p.id <> p_exclude_property_id);
END;
$$;

-- 9. Match Properties for Buyer
CREATE OR REPLACE FUNCTION public.match_properties(p_buyer_id UUID)
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
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_buyer RECORD;
BEGIN
  SELECT * INTO v_buyer FROM public.buyers b WHERE b.id = p_buyer_id AND b.is_deleted = FALSE;
  IF NOT FOUND THEN
    RETURN;
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
    p.created_at
  FROM public.properties p
  JOIN public.sectors s ON s.id = p.sector_id
  JOIN public.property_types t ON t.id = p.type_id
  WHERE p.is_deleted = FALSE
    AND p.status = 'available'
    AND (v_buyer.budget_min IS NULL OR p.price >= v_buyer.budget_min)
    AND (v_buyer.budget_max IS NULL OR p.price <= v_buyer.budget_max)
    AND (
      v_buyer.sector_ids IS NULL
      OR cardinality(v_buyer.sector_ids) = 0
      OR p.sector_id = ANY(v_buyer.sector_ids)
    )
    AND (
      v_buyer.type_ids IS NULL
      OR cardinality(v_buyer.type_ids) = 0
      OR p.type_id = ANY(v_buyer.type_ids)
    )
  ORDER BY p.price ASC, p.created_at DESC;
END;
$$;

-- 10. Export All
CREATE OR REPLACE FUNCTION public.export_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_properties jsonb;
  v_buyers jsonb;
  v_sectors jsonb;
  v_types jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(r)) INTO v_properties
  FROM (
    SELECT
      p.id, p.plot_no, p.plot_id, s.name AS sector, p.location, p.house_no, p.price,
      t.name AS property_type, p.area_size, p.area_unit,
      p.details, p.status, c.contact_name AS owner_name, c.phone AS owner_phone,
      p.created_at, p.updated_at, p.is_deleted
    FROM public.properties p
    LEFT JOIN public.sectors s ON s.id = p.sector_id
    LEFT JOIN public.property_types t ON t.id = p.type_id
    LEFT JOIN public.property_contacts c ON c.property_id = p.id
    ORDER BY p.plot_no ASC
  ) r;

  SELECT jsonb_agg(row_to_json(b)) INTO v_buyers
  FROM (
    SELECT id, name, phone, budget_min, budget_max, notes, status, followup_date, created_at, updated_at, is_deleted
    FROM public.buyers ORDER BY created_at DESC
  ) b;

  SELECT jsonb_agg(row_to_json(s)) INTO v_sectors
  FROM (
    SELECT id, name, is_deleted, created_at FROM public.sectors ORDER BY name ASC
  ) s;

  SELECT jsonb_agg(row_to_json(t)) INTO v_types
  FROM (
    SELECT id, name, sort_order FROM public.property_types ORDER BY sort_order ASC
  ) t;

  RETURN jsonb_build_object(
    'properties', COALESCE(v_properties, '[]'::jsonb),
    'buyers', COALESCE(v_buyers, '[]'::jsonb),
    'sectors', COALESCE(v_sectors, '[]'::jsonb),
    'property_types', COALESCE(v_types, '[]'::jsonb)
  );
END;
$$;

-- Grant execution of all functions to anon and authenticated
GRANT EXECUTE ON FUNCTION public.search_properties TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_property TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_property TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_property_for_edit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_property TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_buyer TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phone_exists TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_properties TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_all TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ping TO anon, authenticated;
