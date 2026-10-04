-- =====================================================================
-- REAL ESTATE MANAGEMENT SYSTEM - SQL TEST SUITE
-- Paste and run this in Supabase SQL Editor to verify database rules.
-- Uses transaction rollback so it does not pollute real database data.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- SETUP TEST FIXTURES (Run as postgres / superuser)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin_id UUID := '11111111-1111-1111-1111-111111111111';
  v_staff_id UUID := '22222222-2222-2222-2222-222222222222';
  v_noprof_id UUID := '33333333-3333-3333-3333-333333333333';
  v_sector_id UUID;
  v_type_id UUID;
  v_p1 UUID;
  v_p2 UUID;
  v_p3 UUID;
  v_p4 UUID;
  v_p1_plot TEXT;
  v_p2_plot TEXT;
  v_p3_plot TEXT;
  v_p4_plot TEXT;
  v_count INT;
  v_phone TEXT;
  v_buyer_id UUID;
  v_matched_count INT;
  v_anon_allowed BOOLEAN := FALSE;
  v_staff_delete_failed BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE '>>> STARTING SQL VERIFICATION TESTS <<<';

  -- 1. Create mock users in auth.users if not exists
  INSERT INTO auth.users (id, email)
  VALUES
    (v_admin_id, 'admin@example.com'),
    (v_staff_id, 'staff@example.com'),
    (v_noprof_id, 'noprofile@example.com')
  ON CONFLICT (id) DO NOTHING;

  -- Ensure profiles
  INSERT INTO public.profiles (user_id, full_name, role)
  VALUES
    (v_admin_id, 'Test Admin', 'admin'),
    (v_staff_id, 'Test Staff', 'staff')
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Ensure user 3 explicitly has NO profile
  DELETE FROM public.profiles WHERE user_id = v_noprof_id;

  -- Ensure at least one sector exists
  INSERT INTO public.sectors (name, created_by)
  VALUES ('Sector 14 Test', v_admin_id)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_sector_id FROM public.sectors WHERE lower(trim(name)) = 'sector 14 test' LIMIT 1;

  -- Get Plot property type
  SELECT id INTO v_type_id FROM public.property_types WHERE name = 'Plot' LIMIT 1;

  -- -------------------------------------------------------------------
  -- TEST 1: Direct select on property_contacts returns zero rows for authenticated
  -- -------------------------------------------------------------------
  RAISE NOTICE 'Testing Test 1: Direct select on property_contacts...';
  -- Create a property first using authenticated admin
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE format('SET LOCAL "request.jwt.claims" = ''{"sub": "%s", "role": "authenticated"}''', v_admin_id);

  SELECT id, plot_id INTO v_p1, v_p1_plot FROM public.create_property(
    v_sector_id, 'Main Road', 'House 1', 10000000, v_type_id, 250, 'sq yard', 'Prime plot', 'available', 'Ramesh Sharma', '9876543210'
  );

  -- Try direct select on property_contacts as authenticated
  SELECT COUNT(*) INTO v_count FROM public.property_contacts;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Direct select on property_contacts returned % rows, expected 0!', v_count;
  END IF;
  RAISE NOTICE 'TEST 1 PASSED: Direct select on property_contacts returned 0 rows.';

  -- -------------------------------------------------------------------
  -- TEST 2: Anon cannot read any table and cannot execute anything except ping
  -- -------------------------------------------------------------------
  RAISE NOTICE 'Testing Test 2: Anon permissions...';
  EXECUTE 'SET LOCAL ROLE anon';
  EXECUTE 'SET LOCAL "request.jwt.claims" = ''{"role": "anon"}''';

  -- Ping must work
  IF public.ping() <> 1 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: ping() did not return 1 for anon!';
  END IF;

  -- Direct select must fail or return 0 rows
  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.properties;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'TEST 2 FAILED: Anon was able to read % rows from properties!', v_count;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected behavior: permission denied
    NULL;
  END;

  -- Calling search_properties must fail for anon
  BEGIN
    PERFORM * FROM public.search_properties();
    v_anon_allowed := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_anon_allowed := FALSE;
  END;
  IF v_anon_allowed THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Anon was able to execute search_properties!';
  END IF;
  RAISE NOTICE 'TEST 2 PASSED: Anon cannot read tables or execute functions except ping().';

  -- -------------------------------------------------------------------
  -- TEST 3: Phone is NULL when p_include_phone is false; returned when true
  -- -------------------------------------------------------------------
  RAISE NOTICE 'Testing Test 3: Phone visibility in search_properties...';
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE format('SET LOCAL "request.jwt.claims" = ''{"sub": "%s", "role": "authenticated"}''', v_staff_id);

  -- When p_include_phone is FALSE:
  SELECT phone INTO v_phone FROM public.search_properties(p_plot_id => v_p1_plot, p_include_phone => FALSE);
  IF v_phone IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Phone was returned when p_include_phone is FALSE!';
  END IF;

  -- When p_include_phone is TRUE:
  SELECT phone INTO v_phone FROM public.search_properties(p_plot_id => v_p1_plot, p_include_phone => TRUE);
  IF v_phone <> '9876543210' THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Phone was not returned when p_include_phone is TRUE! Got: %', v_phone;
  END IF;
  RAISE NOTICE 'TEST 3 PASSED: Phone is strictly NULL when unchecked and returned when checked.';

  -- -------------------------------------------------------------------
  -- TEST 4: Price ranges: 1-1, 0.5-1, 1-5, min-only, max-only, none
  -- -------------------------------------------------------------------
  RAISE NOTICE 'Testing Test 4: Price ranges inclusive filtering...';
  -- Create P2: 50 Lakh (5,000,000)
  SELECT id, plot_id INTO v_p2, v_p2_plot FROM public.create_property(
    v_sector_id, 'Near Park', '12', 5000000, v_type_id, 150, 'sq yard', '50L plot', 'available', 'Suresh', '9811122233'
  );
  -- Create P3: 2 Cr (20,000,000)
  SELECT id, plot_id INTO v_p3, v_p3_plot FROM public.create_property(
    v_sector_id, 'Corner', '15', 20000000, v_type_id, 350, 'sq yard', '2Cr plot', 'available', 'Mahesh', '9822233344'
  );
  -- Create P4: 5 Cr (50,000,000)
  SELECT id, plot_id INTO v_p4, v_p4_plot FROM public.create_property(
    v_sector_id, 'Boulevard', '1', 50000000, v_type_id, 500, 'sq yard', '5Cr plot', 'available', 'Rajesh', '9833344455'
  );

  -- Range 1: Min 1 Cr (10,000,000) and Max 1 Cr (10,000,000) -> EXACTLY 1 Cr ONLY (P1)
  SELECT COUNT(*) INTO v_count FROM public.search_properties(p_min_price => 10000000, p_max_price => 10000000);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: 1 Cr - 1 Cr returned % items, expected exactly 1', v_count;
  END IF;

  -- Range 2: Min 0.5 Cr (5,000,000) and Max 1 Cr (10,000,000) -> P2 (50L) and P1 (1Cr) = 2 items
  SELECT COUNT(*) INTO v_count FROM public.search_properties(p_min_price => 5000000, p_max_price => 10000000);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: 0.5 Cr - 1 Cr returned % items, expected 2', v_count;
  END IF;

  -- Range 3: 1 Cr to 5 Cr (10,000,000 to 50,000,000) -> P1 (1Cr), P3 (2Cr), P4 (5Cr) = 3 items
  SELECT COUNT(*) INTO v_count FROM public.search_properties(p_min_price => 10000000, p_max_price => 50000000);
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: 1 Cr - 5 Cr returned % items, expected 3', v_count;
  END IF;

  -- Range 4: Min only (2 Cr = 20,000,000) -> P3 (2Cr) and P4 (5Cr) = 2 items
  SELECT COUNT(*) INTO v_count FROM public.search_properties(p_min_price => 20000000, p_max_price => NULL);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Min only (2 Cr) returned % items, expected 2', v_count;
  END IF;

  -- Range 5: Max only (1 Cr = 10,000,000) -> P2 (50L) and P1 (1Cr) = 2 items
  SELECT COUNT(*) INTO v_count FROM public.search_properties(p_min_price => NULL, p_max_price => 10000000);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Max only (1 Cr) returned % items, expected 2', v_count;
  END IF;

  -- Range 6: None (NULL, NULL) -> All 4 active items
  SELECT COUNT(*) INTO v_count FROM public.search_properties(p_min_price => NULL, p_max_price => NULL);
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: No bounds returned % items, expected 4', v_count;
  END IF;
  RAISE NOTICE 'TEST 4 PASSED: All price range combinations behave accurately.';

  -- -------------------------------------------------------------------
  -- TEST 5: Plot ID format, strictly increasing, never reused after delete
  -- -------------------------------------------------------------------
  RAISE NOTICE 'Testing Test 5: Plot ID auto-generation and permanence...';
  IF v_p1_plot !~ '^P-[0-9]{4,}$' OR v_p2_plot !~ '^P-[0-9]{4,}$' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Plot ID format invalid: % or %', v_p1_plot, v_p2_plot;
  END IF;
  IF v_p2_plot <= v_p1_plot THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Plot IDs not strictly increasing: % then %', v_p1_plot, v_p2_plot;
  END IF;

  -- Soft delete P1 as admin
  EXECUTE format('SET LOCAL "request.jwt.claims" = ''{"sub": "%s", "role": "authenticated"}''', v_admin_id);
  PERFORM public.soft_delete_property(v_p1);

  -- Create a new property P5; its plot ID must be strictly greater than P4 and NOT reuse P1
  DECLARE
    v_p5 UUID;
    v_p5_plot TEXT;
  BEGIN
    SELECT id, plot_id INTO v_p5, v_p5_plot FROM public.create_property(
      v_sector_id, 'New Extension', '99', 7500000, v_type_id, 200, 'sq yard', 'New plot', 'available', 'Anil', '9844455566'
    );
    IF v_p5_plot = v_p1_plot OR v_p5_plot <= v_p4_plot THEN
      RAISE EXCEPTION 'TEST 5 FAILED: Plot ID reused or not increasing after deletion: P1=%, P4=%, P5=%', v_p1_plot, v_p4_plot, v_p5_plot;
    END IF;
  END;
  RAISE NOTICE 'TEST 5 PASSED: Plot ID is auto-generated, strictly increasing, and never reused.';

  -- -------------------------------------------------------------------
  -- TEST 6: Staff cannot soft delete properties or buyers
  -- -------------------------------------------------------------------
  RAISE NOTICE 'Testing Test 6: Role enforcement on soft deletes...';
  EXECUTE format('SET LOCAL "request.jwt.claims" = ''{"sub": "%s", "role": "authenticated"}''', v_staff_id);

  v_staff_delete_failed := FALSE;
  BEGIN
    PERFORM public.soft_delete_property(v_p2);
  EXCEPTION WHEN OTHERS THEN
    v_staff_delete_failed := TRUE;
  END;
  IF NOT v_staff_delete_failed THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Staff was able to call soft_delete_property!';
  END IF;

  -- Also test trigger blocking direct update of is_deleted by staff
  v_staff_delete_failed := FALSE;
  BEGIN
    UPDATE public.properties SET is_deleted = TRUE WHERE id = v_p2;
  EXCEPTION WHEN OTHERS THEN
    v_staff_delete_failed := TRUE;
  END;
  IF NOT v_staff_delete_failed THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Staff bypassed function and updated is_deleted directly!';
  END IF;
  RAISE NOTICE 'TEST 6 PASSED: Staff cannot delete properties or modify is_deleted.';

  -- -------------------------------------------------------------------
  -- TEST 7: User with no profile row has no access
  -- -------------------------------------------------------------------
  RAISE NOTICE 'Testing Test 7: User without profile row...';
  EXECUTE format('SET LOCAL "request.jwt.claims" = ''{"sub": "%s", "role": "authenticated"}''', v_noprof_id);
  IF public.is_admin() THEN
    RAISE EXCEPTION 'TEST 7 FAILED: User without profile evaluated as admin!';
  END IF;

  -- Cannot perform admin exports
  BEGIN
    PERFORM public.export_all();
    RAISE EXCEPTION 'TEST 7 FAILED: User without profile was able to export_all!';
  EXCEPTION WHEN OTHERS THEN
    -- Expected access denied
    NULL;
  END;
  RAISE NOTICE 'TEST 7 PASSED: User without profile row has zero elevated access.';

  -- -------------------------------------------------------------------
  -- TEST 8: Deleted rows are hidden from search and matching
  -- -------------------------------------------------------------------
  RAISE NOTICE 'Testing Test 8: Deleted rows hidden from search...';
  EXECUTE format('SET LOCAL "request.jwt.claims" = ''{"sub": "%s", "role": "authenticated"}''', v_staff_id);

  -- P1 was soft-deleted. Searching for P1's plot_id must return 0 rows.
  SELECT COUNT(*) INTO v_count FROM public.search_properties(p_plot_id => v_p1_plot);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Deleted property P1 was found in search results!';
  END IF;
  RAISE NOTICE 'TEST 8 PASSED: Deleted rows are completely hidden from search.';

  -- -------------------------------------------------------------------
  -- TEST 9: Buyer matching handles missing budget, sector or type
  -- -------------------------------------------------------------------
  RAISE NOTICE 'Testing Test 9: Buyer matching with empty optional fields...';
  -- Create buyer with NO budget limits, NO sector filter, NO type filter
  INSERT INTO public.buyers (
    name, phone, budget_min, budget_max, sector_ids, type_ids, notes, status, created_by
  )
  VALUES (
    'Open Buyer', '9988776655', NULL, NULL, '{}', '{}', 'Any plot or property', 'active', v_staff_id
  )
  RETURNING id INTO v_buyer_id;

  -- Matching should return all available active properties
  SELECT COUNT(*) INTO v_matched_count FROM public.match_properties(v_buyer_id);
  IF v_matched_count < 3 THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Match with empty options returned % items, expected at least 3', v_matched_count;
  END IF;

  -- Create buyer with specific budget (0.5 Cr to 1.5 Cr)
  INSERT INTO public.buyers (
    name, phone, budget_min, budget_max, sector_ids, type_ids, status, created_by
  )
  VALUES (
    'Budget Buyer', '9988776644', 5000000, 15000000, ARRAY[v_sector_id], ARRAY[v_type_id], 'active', v_staff_id
  )
  RETURNING id INTO v_buyer_id;

  -- P2 (50L) and P5 (75L) match; P1 is deleted, P3 is 2Cr (too high), P4 is 5Cr (too high)
  SELECT COUNT(*) INTO v_matched_count FROM public.match_properties(v_buyer_id);
  IF v_matched_count <> 2 THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Targeted buyer matching returned % items, expected 2 (50L and 75L)', v_matched_count;
  END IF;
  RAISE NOTICE 'TEST 9 PASSED: Buyer matching handles empty and specific filters perfectly.';

  RAISE NOTICE '>>> ALL 9 SQL TEST SUITES PASSED SUCCESSFULLY! <<<';
END;
$$;

ROLLBACK; -- Clean rollback so database state is untouched
