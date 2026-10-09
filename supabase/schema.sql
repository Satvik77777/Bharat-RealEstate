-- =====================================================================
-- REAL ESTATE MANAGEMENT SYSTEM - SUPABASE SCHEMA (IDEMPOTENT)
-- =====================================================================

-- Ensure necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. PROFILES & AUTH HOOK
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Updated_at trigger helper
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger to create profile when auth.users is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'staff'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper function to check admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE user_id = auth.uid();
  RETURN COALESCE(v_role = 'admin', FALSE);
END;
$$;

-- ---------------------------------------------------------------------
-- 2. CORE REFERENCE TABLES: SECTORS & PROPERTY_TYPES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sectors_lower_name ON public.sectors (lower(trim(name)));

DROP TRIGGER IF EXISTS trg_sectors_updated_at ON public.sectors;
CREATE TRIGGER trg_sectors_updated_at
  BEFORE UPDATE ON public.sectors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.property_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DROP TRIGGER IF EXISTS trg_property_types_updated_at ON public.property_types;
CREATE TRIGGER trg_property_types_updated_at
  BEFORE UPDATE ON public.property_types
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Seed the 7 required property types idempotently
INSERT INTO public.property_types (name, sort_order)
VALUES
  ('Plot', 1),
  ('Commercial', 2),
  ('Residential (House/Kothi)', 3),
  ('Agricultural Land', 4),
  ('Flat/Apartment', 5),
  ('Industrial', 6),
  ('Farmhouse', 7)
ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------
-- 3. PROPERTIES & SEQUENCE FOR PLOT_ID
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.property_plot_no_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_no BIGINT NOT NULL DEFAULT nextval('public.property_plot_no_seq') UNIQUE,
  plot_id TEXT NOT NULL UNIQUE,
  sector_id UUID NOT NULL REFERENCES public.sectors(id),
  location TEXT NOT NULL,
  house_no TEXT NULL,
  price BIGINT NOT NULL CHECK (price > 0 AND price <= 1000000000000),
  type_id UUID NOT NULL REFERENCES public.property_types(id),
  area_size NUMERIC NULL,
  area_unit TEXT NULL CHECK (area_unit IS NULL OR area_unit IN ('gaj', 'sq yard', 'marla', 'kanal', 'acre', 'sq ft')),
  details TEXT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold', 'hold')),
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Trigger to guarantee plot_no and plot_id formatting
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

DROP TRIGGER IF EXISTS trg_set_property_plot_id ON public.properties;
CREATE TRIGGER trg_set_property_plot_id
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_property_plot_id();

DROP TRIGGER IF EXISTS trg_properties_updated_at ON public.properties;
CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes on properties
CREATE INDEX IF NOT EXISTS idx_properties_price ON public.properties(price);
CREATE INDEX IF NOT EXISTS idx_properties_sector_id ON public.properties(sector_id);
CREATE INDEX IF NOT EXISTS idx_properties_type_id ON public.properties(type_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON public.properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_active ON public.properties(is_deleted) WHERE is_deleted = FALSE;

-- ---------------------------------------------------------------------
-- 4. PROPERTY CONTACTS (ISOLATED CONTACT INFO)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_contacts (
  property_id UUID PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  contact_name TEXT NULL,
  phone TEXT NOT NULL CHECK (phone ~ '^[6-9][0-9]{9}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DROP TRIGGER IF EXISTS trg_property_contacts_updated_at ON public.property_contacts;
CREATE TRIGGER trg_property_contacts_updated_at
  BEFORE UPDATE ON public.property_contacts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------
-- 5. BUYERS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.buyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL CHECK (phone ~ '^[6-9][0-9]{9}$'),
  budget_min BIGINT NULL,
  budget_max BIGINT NULL,
  sector_ids UUID[] NOT NULL DEFAULT '{}',
  type_ids UUID[] NOT NULL DEFAULT '{}',
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  followup_date DATE NULL,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT chk_buyer_budget CHECK (
    budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max
  )
);

DROP TRIGGER IF EXISTS trg_buyers_updated_at ON public.buyers;
CREATE TRIGGER trg_buyers_updated_at
  BEFORE UPDATE ON public.buyers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_buyers_status ON public.buyers(status);
CREATE INDEX IF NOT EXISTS idx_buyers_active ON public.buyers(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_buyers_followup_date ON public.buyers(followup_date);

-- ---------------------------------------------------------------------
-- 6. ADMIN-ONLY RESTRICTION ON IS_DELETED
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_is_deleted_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access denied: Only administrators can modify the is_deleted status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_properties_is_deleted ON public.properties;
CREATE TRIGGER trg_properties_is_deleted
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.check_is_deleted_admin_only();

DROP TRIGGER IF EXISTS trg_buyers_is_deleted ON public.buyers;
CREATE TRIGGER trg_buyers_is_deleted
  BEFORE UPDATE ON public.buyers
  FOR EACH ROW EXECUTE FUNCTION public.check_is_deleted_admin_only();

-- ---------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;

-- Clean existing policies for idempotency
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "sectors_select" ON public.sectors;
DROP POLICY IF EXISTS "sectors_insert" ON public.sectors;
DROP POLICY IF EXISTS "sectors_update" ON public.sectors;
DROP POLICY IF EXISTS "property_types_select" ON public.property_types;
DROP POLICY IF EXISTS "property_types_insert" ON public.property_types;
DROP POLICY IF EXISTS "property_types_update" ON public.property_types;
DROP POLICY IF EXISTS "properties_select" ON public.properties;
DROP POLICY IF EXISTS "properties_insert" ON public.properties;
DROP POLICY IF EXISTS "properties_update" ON public.properties;
DROP POLICY IF EXISTS "buyers_select" ON public.buyers;
DROP POLICY IF EXISTS "buyers_insert" ON public.buyers;
DROP POLICY IF EXISTS "buyers_update" ON public.buyers;

-- Profiles: users read only their own row. No client write policies.
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Sectors: authenticated select active, insert, update (admin for manage, staff can insert during property add)
CREATE POLICY "sectors_select" ON public.sectors
  FOR SELECT TO authenticated
  USING (is_deleted = FALSE);

CREATE POLICY "sectors_insert" ON public.sectors
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "sectors_update" ON public.sectors
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Property Types: select for authenticated, update/insert for authenticated (admin managed)
CREATE POLICY "property_types_select" ON public.property_types
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "property_types_insert" ON public.property_types
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "property_types_update" ON public.property_types
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Properties: authenticated select where is_deleted = false, insert/update for authenticated. No hard DELETE.
CREATE POLICY "properties_select" ON public.properties
  FOR SELECT TO authenticated
  USING (is_deleted = FALSE);

CREATE POLICY "properties_insert" ON public.properties
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "properties_update" ON public.properties
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Buyers: authenticated select where is_deleted = false, insert/update for authenticated. No hard DELETE.
CREATE POLICY "buyers_select" ON public.buyers
  FOR SELECT TO authenticated
  USING (is_deleted = FALSE);

CREATE POLICY "buyers_insert" ON public.buyers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "buyers_update" ON public.buyers
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Note: property_contacts HAS NO POLICIES AT ALL.
-- Direct SELECT/INSERT/UPDATE/DELETE from client returns empty / permission denied.

-- ---------------------------------------------------------------------
-- 8. REVOKE & GRANT PRIVILEGES (Idempotent & Default Privileges)
-- ---------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, PUBLIC;

-- Default privileges for future tables/functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, PUBLIC;

-- Grant required permissions to authenticated
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sectors TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.property_types TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.properties TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.buyers TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Notice: NO GRANT on public.property_contacts to authenticated or anon!

-- ---------------------------------------------------------------------
-- 9. SECURITY DEFINER FUNCTIONS
-- ---------------------------------------------------------------------

-- Ping function for keep-alive
CREATE OR REPLACE FUNCTION public.ping()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION public.ping() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ping() TO anon, authenticated;

-- Create Property atomically
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Normalize phone
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
    sector_id,
    location,
    house_no,
    price,
    type_id,
    area_size,
    area_unit,
    details,
    status,
    created_by
  )
  VALUES (
    p_sector_id,
    COALESCE(trim(p_location), ''),
    NULLIF(trim(p_house_no), ''),
    p_price,
    p_type_id,
    p_area_size,
    NULLIF(trim(p_area_unit), ''),
    NULLIF(trim(p_details), ''),
    COALESCE(p_status, 'available'),
    auth.uid()
  )
  RETURNING properties.id, properties.plot_id INTO v_property_id, v_plot_id;

  INSERT INTO public.property_contacts (
    property_id,
    contact_name,
    phone
  )
  VALUES (
    v_property_id,
    NULLIF(trim(p_contact_name), ''),
    v_clean_phone
  );

  RETURN QUERY SELECT v_property_id, v_plot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_property(UUID, TEXT, TEXT, BIGINT, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_property(UUID, TEXT, TEXT, BIGINT, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Update Property atomically
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

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

  INSERT INTO public.property_contacts (
    property_id,
    contact_name,
    phone
  )
  VALUES (
    p_id,
    NULLIF(trim(p_contact_name), ''),
    v_clean_phone
  )
  ON CONFLICT (property_id) DO UPDATE
  SET
    contact_name = EXCLUDED.contact_name,
    phone = EXCLUDED.phone;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.update_property(UUID, UUID, TEXT, TEXT, BIGINT, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_property(UUID, UUID, TEXT, TEXT, BIGINT, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Get Property For Edit (Used ONLY by edit form, returns phone)
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
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

REVOKE ALL ON FUNCTION public.get_property_for_edit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_property_for_edit(UUID) TO authenticated;

-- Soft delete property (Admin only)
CREATE OR REPLACE FUNCTION public.soft_delete_property(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin role required to delete properties';
  END IF;

  UPDATE public.properties
  SET is_deleted = TRUE
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_property(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_property(UUID) TO authenticated;

-- Soft delete buyer (Admin only)
CREATE OR REPLACE FUNCTION public.soft_delete_buyer(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin role required to delete buyers';
  END IF;

  UPDATE public.buyers
  SET is_deleted = TRUE
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_buyer(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_buyer(UUID) TO authenticated;

-- Phone exists duplicate warning
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

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

REVOKE ALL ON FUNCTION public.phone_exists(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phone_exists(TEXT, UUID) TO authenticated;

-- Search Properties
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_plot_id IS NOT NULL AND trim(p_plot_id) <> '' THEN
    -- Strip non-alphanumeric except hyphen
    v_normalized_plot_id := upper(trim(p_plot_id));
    -- If user typed digits only e.g. "12" or "0012", try extracting number
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
    -- Price range inclusive on both ends; NULL bound means no limit
    AND (p_min_price IS NULL OR p.price >= p_min_price)
    AND (p_max_price IS NULL OR p.price <= p_max_price)
    -- Sector filters
    AND (p_sector_ids IS NULL OR cardinality(p_sector_ids) = 0 OR p.sector_id = ANY(p_sector_ids))
    -- Property type filters
    AND (p_type_ids IS NULL OR cardinality(p_type_ids) = 0 OR p.type_id = ANY(p_type_ids))
    -- Status filters
    AND (p_statuses IS NULL OR cardinality(p_statuses) = 0 OR p.status = ANY(p_statuses))
    -- Plot ID matching
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
    -- Default 'newest'
    p.created_at DESC,
    p.id DESC -- Stable tie-breaker
  LIMIT COALESCE(p_limit, 20)
  OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.search_properties(BIGINT, BIGINT, UUID[], UUID[], TEXT[], TEXT, BOOLEAN, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_properties(BIGINT, BIGINT, UUID[], UUID[], TEXT[], TEXT, BOOLEAN, TEXT, INT, INT) TO authenticated;

-- Match Properties for Buyer
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_buyer FROM public.buyers b WHERE b.id = p_buyer_id AND b.is_deleted = FALSE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Buyer not found or deleted';
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
    -- Budget filter: inclusive on both ends; NULL = no limit
    AND (v_buyer.budget_min IS NULL OR p.price >= v_buyer.budget_min)
    AND (v_buyer.budget_max IS NULL OR p.price <= v_buyer.budget_max)
    -- Sector matching: empty / null = any
    AND (
      v_buyer.sector_ids IS NULL
      OR cardinality(v_buyer.sector_ids) = 0
      OR p.sector_id = ANY(v_buyer.sector_ids)
    )
    -- Property type matching: empty / null = any
    AND (
      v_buyer.type_ids IS NULL
      OR cardinality(v_buyer.type_ids) = 0
      OR p.type_id = ANY(v_buyer.type_ids)
    )
  ORDER BY p.price ASC, p.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.match_properties(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_properties(UUID) TO authenticated;

-- Export All (Admin only)
CREATE OR REPLACE FUNCTION public.export_all()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_properties JSONB;
  v_buyers JSONB;
  v_sectors JSONB;
  v_types JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin role required to export all data';
  END IF;

  SELECT jsonb_agg(row_to_json(r)) INTO v_properties
  FROM (
    SELECT
      p.id,
      p.plot_no,
      p.plot_id,
      s.name AS sector,
      p.location,
      p.house_no,
      p.price,
      t.name AS property_type,
      p.area_size,
      p.area_unit,
      p.details,
      p.status,
      c.contact_name AS owner_name,
      c.phone AS owner_phone,
      p.created_at,
      p.updated_at,
      p.is_deleted
    FROM public.properties p
    LEFT JOIN public.sectors s ON s.id = p.sector_id
    LEFT JOIN public.property_types t ON t.id = p.type_id
    LEFT JOIN public.property_contacts c ON c.property_id = p.id
    ORDER BY p.plot_no ASC
  ) r;

  SELECT jsonb_agg(row_to_json(b)) INTO v_buyers
  FROM (
    SELECT
      id,
      name,
      phone,
      budget_min,
      budget_max,
      notes,
      status,
      followup_date,
      created_at,
      updated_at,
      is_deleted
    FROM public.buyers
    ORDER BY created_at DESC
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

REVOKE ALL ON FUNCTION public.export_all() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_all() TO authenticated;

-- ---------------------------------------------------------------------
-- 10. KEEP-ALIVE PING FUNCTION (PREVENTS SUPABASE FREE-TIER 7-DAY PAUSING)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ping()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 1;
$$;

GRANT EXECUTE ON FUNCTION public.ping() TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 11. DIRECT ACCESS / NO-LOGIN PORTAL PERMISSIONS
-- ---------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE ON public.sectors TO anon;
GRANT SELECT, INSERT, UPDATE ON public.property_types TO anon;
GRANT SELECT, INSERT, UPDATE ON public.properties TO anon;
GRANT SELECT, INSERT, UPDATE ON public.buyers TO anon;
GRANT SELECT, INSERT, UPDATE ON public.property_contacts TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;

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

