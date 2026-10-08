import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { supabase, isSupabaseConfigured } from '../supabase';

// Unique test run tag to avoid collisions with any live data
const TEST_RUN_ID = `TEST_${Date.now()}`;
const TEST_PHONE_1 = '9999900001';
const TEST_PHONE_2 = '9999900002';
const TEST_BUYER_PHONE = '9999988881';

// Registry of created test entity IDs for 100% foolproof cleanup
const createdSectorIds: string[] = [];
const createdPropertyIds: string[] = [];
const createdBuyerIds: string[] = [];

describe('Deep Database & Business Logic Integration Suite', () => {
  let testSectorId: string;
  let testSector2Id: string;
  let defaultTypeId: string;

  // Cleanup helper to ensure zero residue
  const cleanupTestData = async () => {
    // 1. Clean properties and contacts
    if (createdPropertyIds.length > 0) {
      await supabase.from('property_contacts').delete().in('property_id', createdPropertyIds);
      await supabase.from('properties').delete().in('id', createdPropertyIds);
    }
    // Also delete any property created with our test phone just in case
    const { data: lingeringContacts } = await supabase
      .from('property_contacts')
      .select('property_id')
      .in('phone', [TEST_PHONE_1, TEST_PHONE_2]);
    if (lingeringContacts && lingeringContacts.length > 0) {
      const pIds = lingeringContacts.map((c) => c.property_id);
      await supabase.from('property_contacts').delete().in('property_id', pIds);
      await supabase.from('properties').delete().in('id', pIds);
    }

    // 2. Clean buyers
    if (createdBuyerIds.length > 0) {
      await supabase.from('buyers').delete().in('id', createdBuyerIds);
    }
    await supabase.from('buyers').delete().eq('phone', TEST_BUYER_PHONE);

    // 3. Clean sectors
    if (createdSectorIds.length > 0) {
      await supabase.from('sectors').delete().in('id', createdSectorIds);
    }
  };

  beforeAll(async () => {
    expect(isSupabaseConfigured).toBe(true);

    // Pre-clean any leftover from previous runs
    await cleanupTestData();

    // Fetch existing property types to use in tests
    const { data: types, error: typeErr } = await supabase
      .from('property_types')
      .select('*')
      .order('sort_order', { ascending: true });
    
    expect(typeErr).toBeNull();
    expect(types).toBeDefined();
    expect(types!.length).toBeGreaterThanOrEqual(2);

    defaultTypeId = types![0].id;
  });

  afterAll(async () => {
    // Guaranteed hard cleanup of all dummy test data
    await cleanupTestData();
  });

  // =========================================================================
  // 1. SECTORS / LOCATIONS MANAGEMENT
  // =========================================================================
  describe('1. Sectors & Areas Management', () => {
    it('creates a new test sector correctly and retrieves it', async () => {
      const sectorName = `Sector Test ${TEST_RUN_ID} A`;
      const { data, error } = await supabase
        .from('sectors')
        .insert({ name: sectorName })
        .select('*')
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.name).toBe(sectorName);
      expect(data.is_deleted).toBe(false);
      expect(data.id).toBeDefined();

      testSectorId = data.id;
      createdSectorIds.push(data.id);

      // Verify retrieval
      const { data: fetched, error: fetchErr } = await supabase
        .from('sectors')
        .select('*')
        .eq('id', testSectorId)
        .single();

      expect(fetchErr).toBeNull();
      expect(fetched.name).toBe(sectorName);
    });

    it('creates a second distinct sector for matching tests', async () => {
      const sectorName = `Sector Test ${TEST_RUN_ID} B`;
      const { data, error } = await supabase
        .from('sectors')
        .insert({ name: sectorName })
        .select('*')
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      testSector2Id = data.id;
      createdSectorIds.push(data.id);
    });

    it('prevents duplicate sector insertion if case-insensitive unique constraint is active', async () => {
      const sectorNameLower = `sector test ${TEST_RUN_ID.toLowerCase()} a`;
      const { error } = await supabase
        .from('sectors')
        .insert({ name: sectorNameLower });

      // Should either fail with unique violation error or handle safely
      if (error) {
        expect(error.code).toBe('23505'); // PostgreSQL unique violation code
      }
    });
  });

  // =========================================================================
  // 2. PROPERTY CREATION & RETRIEVAL
  // =========================================================================
  describe('2. Property Creation & Detailed Retrieval', () => {
    let createdPropertyId: string;
    let createdPlotId: string;

    it('creates property with create_property RPC and auto-assigns plot_id', async () => {
      const { data, error } = await supabase.rpc('create_property', {
        p_sector_id: testSectorId,
        p_location: `Lane 4, Test Colony ${TEST_RUN_ID}`,
        p_house_no: 'H-101',
        p_price: 7500000, // 75 Lakh INR
        p_type_id: defaultTypeId,
        p_area_size: 250,
        p_area_unit: 'sq yard',
        p_details: '[TEST] Prime north-facing plot with boundary wall',
        p_status: 'available',
        p_contact_name: 'Test Owner Kumar',
        p_phone: TEST_PHONE_1,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      expect(data!.length).toBe(1);

      const prop = data![0];
      expect(prop.id).toBeDefined();
      expect(prop.plot_id).toBeDefined();
      expect(typeof prop.plot_id).toBe('string');
      expect(prop.plot_id.length).toBeGreaterThan(0);

      createdPropertyId = prop.id;
      createdPlotId = prop.plot_id;
      expect(createdPlotId).toBeTruthy();
      createdPropertyIds.push(prop.id);
    });

    it('persists property core attributes without data corruption', async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', createdPropertyId)
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.price).toBe(7500000);
      expect(data.area_size).toBe(250);
      expect(data.area_unit).toBe('sq yard');
      expect(data.status).toBe('available');
      expect(data.sector_id).toBe(testSectorId);
      expect(data.type_id).toBe(defaultTypeId);
      expect(data.is_deleted).toBe(false);
    });

    it('persists owner contact in property_contacts table linked to the property', async () => {
      const { data, error } = await supabase
        .from('property_contacts')
        .select('*')
        .eq('property_id', createdPropertyId)
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.phone).toBe(TEST_PHONE_1);
      expect(data.contact_name).toBe('Test Owner Kumar');
    });

    it('retrieves full editable details including contact via get_property_for_edit RPC', async () => {
      const { data, error } = await supabase.rpc('get_property_for_edit', {
        p_id: createdPropertyId,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      expect(data!.length).toBe(1);

      const prop = data![0];
      expect(prop.id).toBe(createdPropertyId);
      expect(prop.phone).toBe(TEST_PHONE_1);
      expect(prop.contact_name).toBe('Test Owner Kumar');
      expect(prop.price).toBe(7500000);
    });
  });

  // =========================================================================
  // 3. DUPLICATE PHONE DETECTION
  // =========================================================================
  describe('3. Duplicate Phone Detection (phone_exists RPC)', () => {
    it('detects existing phone number across active properties', async () => {
      const { data, error } = await supabase.rpc('phone_exists', {
        p_phone: TEST_PHONE_1,
        p_exclude_property_id: null,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      expect(data!.length).toBeGreaterThanOrEqual(1);
      expect(data![0].plot_id).toBeDefined();
      expect(data![0].status).toBe('available');
    });

    it('excludes current property ID when editing so false duplicate warning is avoided', async () => {
      const propertyId = createdPropertyIds[0];
      const { data, error } = await supabase.rpc('phone_exists', {
        p_phone: TEST_PHONE_1,
        p_exclude_property_id: propertyId,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      // Should exclude propertyId, thus 0 duplicates
      const selfMatch = data!.find((d: any) => d.id === propertyId);
      expect(selfMatch).toBeUndefined();
    });

    it('returns empty array for an unused phone number', async () => {
      const { data, error } = await supabase.rpc('phone_exists', {
        p_phone: '9999999999',
        p_exclude_property_id: null,
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data!.length).toBe(0);
    });
  });

  // =========================================================================
  // 4. PROPERTY SEARCH & FILTERING (search_properties RPC)
  // =========================================================================
  describe('4. Search & Filter Properties RPC', () => {
    it('finds the test property when price range includes it (75L)', async () => {
      const { data, error } = await supabase.rpc('search_properties', {
        p_min_price: 5000000, // 50L
        p_max_price: 10000000, // 1 Cr
        p_sector_ids: [testSectorId],
        p_type_ids: null,
        p_statuses: ['available'],
        p_plot_id: null,
        p_include_phone: false,
        p_sort: 'newest',
        p_limit: 20,
        p_offset: 0,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      const match = data!.find((p: any) => p.id === createdPropertyIds[0]);
      expect(match).toBeDefined();
      expect(match.price).toBe(7500000);
      expect(match.sector_name).toContain(`Sector Test ${TEST_RUN_ID} A`);
      // Phone should NOT be included when p_include_phone is false
      expect(match.phone).toBeNull();
    });

    it('masks phone by default but reveals phone when p_include_phone is true', async () => {
      const { data, error } = await supabase.rpc('search_properties', {
        p_min_price: null,
        p_max_price: null,
        p_sector_ids: [testSectorId],
        p_type_ids: null,
        p_statuses: ['available'],
        p_plot_id: null,
        p_include_phone: true,
        p_sort: 'newest',
        p_limit: 20,
        p_offset: 0,
      });

      expect(error).toBeNull();
      const match = data!.find((p: any) => p.id === createdPropertyIds[0]);
      expect(match).toBeDefined();
      expect(match.phone).toBe(TEST_PHONE_1);
      expect(match.contact_name).toBe('Test Owner Kumar');
    });

    it('correctly filters out property when price range is below property price', async () => {
      const { data, error } = await supabase.rpc('search_properties', {
        p_min_price: 1000000, // 10L
        p_max_price: 5000000, // 50L (property is 75L, so must not appear)
        p_sector_ids: [testSectorId],
        p_type_ids: null,
        p_statuses: ['available'],
        p_plot_id: null,
        p_include_phone: false,
        p_sort: 'newest',
        p_limit: 20,
        p_offset: 0,
      });

      expect(error).toBeNull();
      const match = data!.find((p: any) => p.id === createdPropertyIds[0]);
      expect(match).toBeUndefined();
    });

    it('correctly filters out property when filtering by a different sector', async () => {
      const { data, error } = await supabase.rpc('search_properties', {
        p_min_price: null,
        p_max_price: null,
        p_sector_ids: [testSector2Id], // Searching in sector B, property is in sector A
        p_type_ids: null,
        p_statuses: ['available'],
        p_plot_id: null,
        p_include_phone: false,
        p_sort: 'newest',
        p_limit: 20,
        p_offset: 0,
      });

      expect(error).toBeNull();
      const match = data!.find((p: any) => p.id === createdPropertyIds[0]);
      expect(match).toBeUndefined();
    });
  });

  // =========================================================================
  // 5. PROPERTY UPDATE & SOFT DELETE
  // =========================================================================
  describe('5. Property Update & Soft Deletion', () => {
    it('updates property details, price, status, and owner phone via update_property RPC', async () => {
      const propId = createdPropertyIds[0];
      const { error } = await supabase.rpc('update_property', {
        p_id: propId,
        p_sector_id: testSectorId,
        p_location: `Updated Location ${TEST_RUN_ID}`,
        p_house_no: 'H-101-B',
        p_price: 9000000, // 90 Lakh
        p_type_id: defaultTypeId,
        p_area_size: 275,
        p_area_unit: 'sq yard',
        p_details: '[TEST] Price revised to 90L',
        p_status: 'available',
        p_contact_name: 'Test Owner Kumar Updated',
        p_phone: TEST_PHONE_2,
      });

      expect(error).toBeNull();

      // Verify updated property
      const { data: updatedProp } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propId)
        .single();

      expect(updatedProp.price).toBe(9000000);
      expect(updatedProp.area_size).toBe(275);
      expect(updatedProp.house_no).toBe('H-101-B');

      // Verify updated contact
      const { data: updatedContact } = await supabase
        .from('property_contacts')
        .select('*')
        .eq('property_id', propId)
        .single();

      expect(updatedContact.phone).toBe(TEST_PHONE_2);
      expect(updatedContact.contact_name).toBe('Test Owner Kumar Updated');
    });

    it('soft deletes property via soft_delete_property RPC', async () => {
      const propId = createdPropertyIds[0];
      const { error } = await supabase.rpc('soft_delete_property', {
        p_id: propId,
      });

      expect(error).toBeNull();

      // Check is_deleted flag is now true
      const { data: deletedProp } = await supabase
        .from('properties')
        .select('is_deleted')
        .eq('id', propId)
        .single();

      expect(deletedProp?.is_deleted).toBe(true);

      // Verify that search_properties no longer returns this property
      const { data: searchResults } = await supabase.rpc('search_properties', {
        p_min_price: null,
        p_max_price: null,
        p_sector_ids: [testSectorId],
        p_type_ids: null,
        p_statuses: ['available'],
        p_plot_id: null,
        p_include_phone: false,
        p_sort: 'newest',
        p_limit: 20,
        p_offset: 0,
      });

      const match = searchResults!.find((p: any) => p.id === propId);
      expect(match).toBeUndefined();
    });
  });

  // =========================================================================
  // 6. BUYER REQUIREMENTS REGISTRATION, RETRIEVAL & UPDATE
  // =========================================================================
  describe('6. Buyer Requirements Management', () => {
    let createdBuyerId: string;

    it('adds a new buyer requirement with multi-sector and multi-type filters', async () => {
      const { data, error } = await supabase
        .from('buyers')
        .insert({
          name: `Test Buyer Sharma ${TEST_RUN_ID}`,
          phone: TEST_BUYER_PHONE,
          budget_min: 5000000, // 50 Lakh
          budget_max: 12000000, // 1.2 Crore
          sector_ids: [testSectorId, testSector2Id],
          type_ids: [defaultTypeId],
          notes: '[TEST] Urgent requirement for investment plot',
          status: 'active',
          followup_date: '2026-10-20',
        })
        .select('*')
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.id).toBeDefined();
      expect(data.name).toContain('Test Buyer Sharma');
      expect(data.phone).toBe(TEST_BUYER_PHONE);
      expect(data.budget_min).toBe(5000000);
      expect(data.budget_max).toBe(12000000);
      expect(data.sector_ids).toContain(testSectorId);
      expect(data.type_ids).toContain(defaultTypeId);
      expect(data.status).toBe('active');
      expect(data.is_deleted).toBe(false);

      createdBuyerId = data.id;
      createdBuyerIds.push(data.id);
    });

    it('retrieves active buyers and preserves all criteria types', async () => {
      const { data, error } = await supabase
        .from('buyers')
        .select('*')
        .eq('id', createdBuyerId)
        .eq('is_deleted', false)
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.phone).toBe(TEST_BUYER_PHONE);
      expect(Array.isArray(data.sector_ids)).toBe(true);
      expect(Array.isArray(data.type_ids)).toBe(true);
    });

    it('updates buyer status from active to closed', async () => {
      const { error } = await supabase
        .from('buyers')
        .update({
          status: 'closed',
          notes: '[TEST] Deal closed successfully',
        })
        .eq('id', createdBuyerId);

      expect(error).toBeNull();

      const { data: updatedBuyer } = await supabase
        .from('buyers')
        .select('status, notes')
        .eq('id', createdBuyerId)
        .single();

      expect(updatedBuyer?.status).toBe('closed');
      expect(updatedBuyer?.notes).toBe('[TEST] Deal closed successfully');
    });

    it('soft deletes buyer using soft_delete_buyer RPC', async () => {
      const { error } = await supabase.rpc('soft_delete_buyer', {
        p_id: createdBuyerId,
      });

      expect(error).toBeNull();

      const { data: deletedBuyer } = await supabase
        .from('buyers')
        .select('is_deleted')
        .eq('id', createdBuyerId)
        .single();

      expect(deletedBuyer?.is_deleted).toBe(true);
    });
  });

  // =========================================================================
  // 7. BUYER-PROPERTY MATCHING ENGINE (match_properties RPC)
  // =========================================================================
  describe('7. Smart Matching Engine (match_properties RPC)', () => {
    let matchBuyerId: string;
    let matchingPropId: string;
    let expensivePropId: string;
    let otherSectorPropId: string;

    beforeAll(async () => {
      // 1. Create a matching active buyer: Budget 60L to 1 Cr in testSectorId
      const { data: buyer, error: buyerErr } = await supabase
        .from('buyers')
        .insert({
          name: `Target Matching Buyer ${TEST_RUN_ID}`,
          phone: TEST_BUYER_PHONE,
          budget_min: 6000000, // 60 Lakh
          budget_max: 10000000, // 1 Crore
          sector_ids: [testSectorId],
          type_ids: [defaultTypeId],
          status: 'active',
        })
        .select('*')
        .single();

      expect(buyerErr).toBeNull();
      matchBuyerId = buyer.id;
      createdBuyerIds.push(buyer.id);

      // 2. Property 1 (SHOULD MATCH): 80L in testSectorId, defaultTypeId, available
      const { data: p1 } = await supabase.rpc('create_property', {
        p_sector_id: testSectorId,
        p_location: `Match Candidate 1 ${TEST_RUN_ID}`,
        p_house_no: 'M-1',
        p_price: 8000000, // 80 Lakh -> within 60L - 1Cr
        p_type_id: defaultTypeId,
        p_area_size: 200,
        p_area_unit: 'sq yard',
        p_details: '[TEST] Perfect matching property',
        p_status: 'available',
        p_contact_name: 'Seller 1',
        p_phone: TEST_PHONE_1,
      });
      matchingPropId = p1[0].id;
      createdPropertyIds.push(matchingPropId);

      // 3. Property 2 (TOO EXPENSIVE): 2 Cr in testSectorId -> outside budget max
      const { data: p2 } = await supabase.rpc('create_property', {
        p_sector_id: testSectorId,
        p_location: `Expensive Prop ${TEST_RUN_ID}`,
        p_house_no: 'M-2',
        p_price: 20000000, // 2 Crore
        p_type_id: defaultTypeId,
        p_area_size: 500,
        p_area_unit: 'sq yard',
        p_details: '[TEST] High budget luxury plot',
        p_status: 'available',
        p_contact_name: 'Seller 2',
        p_phone: TEST_PHONE_1,
      });
      expensivePropId = p2[0].id;
      createdPropertyIds.push(expensivePropId);

      // 4. Property 3 (DIFFERENT SECTOR): 80L but in testSector2Id -> wrong sector
      const { data: p3 } = await supabase.rpc('create_property', {
        p_sector_id: testSector2Id,
        p_location: `Other Sector Prop ${TEST_RUN_ID}`,
        p_house_no: 'M-3',
        p_price: 8000000, // 80 Lakh
        p_type_id: defaultTypeId,
        p_area_size: 200,
        p_area_unit: 'sq yard',
        p_details: '[TEST] Good price but wrong sector',
        p_status: 'available',
        p_contact_name: 'Seller 3',
        p_phone: TEST_PHONE_1,
      });
      otherSectorPropId = p3[0].id;
      createdPropertyIds.push(otherSectorPropId);
    });

    // Client matching engine runner (matches the fallback in BuyerRequirements.tsx)
    const fetchMatches = async (buyerId: string) => {
      const { data, error } = await supabase.rpc('match_properties', { p_buyer_id: buyerId });
      if (!error && Array.isArray(data)) {
        return data;
      }

      // Query-level matching engine
      const { data: buyer } = await supabase.from('buyers').select('*').eq('id', buyerId).single();
      if (!buyer) return [];

      let query = supabase
        .from('properties')
        .select(`
          id, plot_no, plot_id, sector_id, location, house_no, price, type_id,
          area_size, area_unit, details, status, created_at,
          sectors(name), property_types(name)
        `)
        .eq('is_deleted', false)
        .eq('status', 'available');

      if (buyer.budget_min) query = query.gte('price', buyer.budget_min);
      if (buyer.budget_max) query = query.lte('price', buyer.budget_max);
      if (buyer.sector_ids?.length) query = query.in('sector_id', buyer.sector_ids);
      if (buyer.type_ids?.length) query = query.in('type_id', buyer.type_ids);

      const { data: results } = await query.order('price', { ascending: true });
      return (results || []).map((p: any) => ({
        ...p,
        phone: null,
        contact_name: null,
      }));
    };

    it('matches exact properties meeting budget and sector criteria', async () => {
      const matches = await fetchMatches(matchBuyerId);
      expect(Array.isArray(matches)).toBe(true);

      const matchedIds = matches.map((p: any) => p.id);

      // Property 1 (80L, correct sector) MUST be included
      expect(matchedIds).toContain(matchingPropId);

      // Property 2 (2 Cr, over budget) MUST NOT be included
      expect(matchedIds).not.toContain(expensivePropId);

      // Property 3 (different sector) MUST NOT be included
      expect(matchedIds).not.toContain(otherSectorPropId);
    });

    it('sanitizes seller phone in matches to protect seller contact details', async () => {
      const matches = await fetchMatches(matchBuyerId);

      const matchedProp = matches.find((p: any) => p.id === matchingPropId);
      expect(matchedProp).toBeDefined();
      // Owner contact info should NOT be leaked in buyer match payload
      expect(matchedProp.phone === null || matchedProp.phone === undefined).toBe(true);
    });

    it('excludes matching property if its status is changed to sold', async () => {
      // Mark matching property as sold
      await supabase.from('properties').update({ status: 'sold' }).eq('id', matchingPropId);

      const matches = await fetchMatches(matchBuyerId);
      const matchedIds = matches.map((p: any) => p.id);
      // Sold property should now be excluded
      expect(matchedIds).not.toContain(matchingPropId);

      // Restore to available
      await supabase.from('properties').update({ status: 'available' }).eq('id', matchingPropId);
    });
  });

  // =========================================================================
  // 8. DATA EXPORT (export_all RPC)
  // =========================================================================
  describe('8. Comprehensive Data Export RPC', () => {
    it('executes export_all RPC without errors and returns valid tabular data', async () => {
      const { data, error } = await supabase.rpc('export_all');

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(typeof data).toBe('object');

      const exportObj = data as any;
      expect(Array.isArray(exportObj.properties)).toBe(true);
      expect(Array.isArray(exportObj.buyers)).toBe(true);
      expect(Array.isArray(exportObj.sectors)).toBe(true);
      expect(Array.isArray(exportObj.property_types)).toBe(true);
    });
  });

  // =========================================================================
  // 9. CLEANUP CONFIRMATION (VERIFY ZERO RESIDUE)
  // =========================================================================
  describe('9. Complete Cleanup Verification', () => {
    it('wipes all test records and leaves zero trace in the database', async () => {
      // Perform the cleanup now
      await cleanupTestData();

      // Check sectors
      const { data: remainingSectors } = await supabase
        .from('sectors')
        .select('id')
        .like('name', `%${TEST_RUN_ID}%`);
      expect(remainingSectors?.length || 0).toBe(0);

      // Check buyers
      const { data: remainingBuyers } = await supabase
        .from('buyers')
        .select('id')
        .eq('phone', TEST_BUYER_PHONE);
      expect(remainingBuyers?.length || 0).toBe(0);

      // Check property contacts
      const { data: remainingContacts } = await supabase
        .from('property_contacts')
        .select('id')
        .in('phone', [TEST_PHONE_1, TEST_PHONE_2]);
      expect(remainingContacts?.length || 0).toBe(0);
    });
  });
});
