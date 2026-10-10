import { supabase, isSupabaseConfigured } from './supabase';
import type { Sector, PropertyType } from '../types/database';

let cachedSectors: Sector[] | null = null;
let cachedTypes: PropertyType[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

/**
 * Returns cached sectors and property types to eliminate redundant API requests
 * during repeated page switching and searches.
 */
export async function getCachedReferenceData(forceRefresh = false): Promise<{
  sectors: Sector[];
  propertyTypes: PropertyType[];
}> {
  const now = Date.now();
  if (!forceRefresh && cachedSectors && cachedTypes && now - lastFetchTime < CACHE_TTL_MS) {
    return { sectors: cachedSectors, propertyTypes: cachedTypes };
  }

  if (!isSupabaseConfigured) {
    const mockSectors: Sector[] = [
      { id: 'sec-1', name: 'Sector 5', is_deleted: false, created_at: '', updated_at: '' },
      { id: 'sec-2', name: 'Sector 7', is_deleted: false, created_at: '', updated_at: '' },
      { id: 'sec-3', name: 'Sector 8', is_deleted: false, created_at: '', updated_at: '' },
      { id: 'sec-4', name: 'Kohinoor City I', is_deleted: false, created_at: '', updated_at: '' },
    ];
    const mockTypes: PropertyType[] = [
      { id: 't-1', name: 'Plot', sort_order: 1 },
      { id: 't-2', name: 'Residential (House/Kothi)', sort_order: 2 },
      { id: 't-3', name: 'Commercial', sort_order: 3 },
    ];
    cachedSectors = mockSectors;
    cachedTypes = mockTypes;
    lastFetchTime = now;
    return { sectors: mockSectors, propertyTypes: mockTypes };
  }

  try {
    const [sectorsRes, typesRes] = await Promise.all([
      supabase.from('sectors').select('*').eq('is_deleted', false).order('name'),
      supabase.from('property_types').select('*').order('sort_order'),
    ]);

    if (!sectorsRes.error && sectorsRes.data) {
      cachedSectors = sectorsRes.data;
    }
    if (!typesRes.error && typesRes.data) {
      cachedTypes = typesRes.data;
    }
    lastFetchTime = now;
  } catch {
    // If fetch fails, keep current cache
  }

  return {
    sectors: cachedSectors || [],
    propertyTypes: cachedTypes || [],
  };
}

/**
 * Invalidates reference cache (e.g. after a new sector is created).
 */
export function invalidateReferenceCache(): void {
  cachedSectors = null;
  cachedTypes = null;
  lastFetchTime = 0;
}
