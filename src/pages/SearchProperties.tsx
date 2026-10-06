import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  MessageCircle,
  Copy,
  Download,
  RotateCcw,
  CheckSquare,
  Square,
  Building,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Users as UsersIcon,
  Check,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
  MapPin,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { parsePriceInput, formatPrice, type PriceUnit } from '../lib/price';
import { normalizePhone } from '../lib/phone';
import { buildWhatsAppLink, formatPropertiesMessage, type WhatsAppPropertyItem } from '../lib/whatsapp';
import { generateCsv, downloadCsv } from '../lib/csv';
import type { Property, Sector, PropertyType } from '../types/database';

export const SearchProperties: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  // References
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);

  // Dashboard strip metrics
  const [metrics, setMetrics] = useState<{ totalAvailable: number; byType: Record<string, number>; activeBuyers: number }>({
    totalAvailable: 0,
    byType: {},
    activeBuyers: 0,
  });

  // Filter states (hydrated from searchParams)
  const [minPriceVal, setMinPriceVal] = useState(searchParams.get('minP') || '');
  const [minPriceUnit, setMinPriceUnit] = useState<PriceUnit>((searchParams.get('minU') as PriceUnit) || 'Lakh');
  const [maxPriceVal, setMaxPriceVal] = useState(searchParams.get('maxP') || '');
  const [maxPriceUnit, setMaxPriceUnit] = useState<PriceUnit>((searchParams.get('maxU') as PriceUnit) || 'Cr');

  const [sectorInput, setSectorInput] = useState(searchParams.get('sector') || '');
  const [isSectorDropdownOpen, setIsSectorDropdownOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    searchParams.get('types') ? searchParams.get('types')!.split(',').filter(Boolean) : []
  );
  const [sortBy, setSortBy] = useState<string>(searchParams.get('sort') || 'newest');
  const [currentPage, setCurrentPage] = useState<number>(Number(searchParams.get('page')) || 1);

  // Phone visibility security toggle (default false - ensures phone is absent from response)
  const [showPhone, setShowPhone] = useState(searchParams.get('showPhone') === 'true');

  // Mobile collapsible filter drawer toggle
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  // Active filter count for mobile badge
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (minPriceVal) count++;
    if (maxPriceVal) count++;
    if (sectorInput.trim()) count++;
    if (selectedTypes.length > 0) count += selectedTypes.length;
    return count;
  }, [minPriceVal, maxPriceVal, sectorInput, selectedTypes]);

  // Query Results
  const [properties, setProperties] = useState<Property[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Selected for WhatsApp sharing / export
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filtered sectors for live interactive autocomplete dropdown (e.g. typing "sec" or "moh")
  const filteredSectors = useMemo(() => {
    if (!sectorInput.trim()) return sectors.slice(0, 10);
    const q = sectorInput.trim().toLowerCase();
    return sectors.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 15);
  }, [sectors, sectorInput]);

  // Quick range chips configuration
  const quickRanges = [
    { label: 'Up to 50 Lakh', minVal: '', minUnit: 'Lakh', maxVal: '50', maxUnit: 'Lakh' },
    { label: '50 Lakh to 1 Cr', minVal: '50', minUnit: 'Lakh', maxVal: '1', maxUnit: 'Cr' },
    { label: '1 to 2 Cr', minVal: '1', minUnit: 'Cr', maxVal: '2', maxUnit: 'Cr' },
    { label: '2 to 5 Cr', minVal: '2', minUnit: 'Cr', maxVal: '5', maxUnit: 'Cr' },
    { label: '5 Cr and above', minVal: '5', minUnit: 'Cr', maxVal: '', maxUnit: 'Cr' },
  ];

  // Load Reference Data and Dashboard Strip
  const loadReferencesAndMetrics = async () => {
    try {
      if (!isSupabaseConfigured) {
        const mockSectors = [
          { id: 'sec-1', name: 'Sector 14', created_at: '', updated_at: '', is_deleted: false },
          { id: 'sec-2', name: 'Sector 15', created_at: '', updated_at: '', is_deleted: false },
          { id: 'sec-3', name: 'Golf Course Road', created_at: '', updated_at: '', is_deleted: false },
          { id: 'sec-4', name: 'DLF Phase 1', created_at: '', updated_at: '', is_deleted: false },
        ];
        const mockTypes = [
          { id: 'type-1', name: 'Plot', sort_order: 1 },
          { id: 'type-2', name: 'Commercial', sort_order: 2 },
          { id: 'type-3', name: 'Residential (House/Kothi)', sort_order: 3 },
          { id: 'type-4', name: 'Agricultural Land', sort_order: 4 },
          { id: 'type-5', name: 'Flat/Apartment', sort_order: 5 },
          { id: 'type-6', name: 'Industrial', sort_order: 6 },
          { id: 'type-7', name: 'Farmhouse', sort_order: 7 },
        ];
        setSectors(mockSectors);
        setPropertyTypes(mockTypes);

        const mockRecent = JSON.parse(localStorage.getItem('re_mock_properties') || '[]');
        const mockBuyers = JSON.parse(localStorage.getItem('re_mock_buyers') || '[]');
        const byTypeCounts: Record<string, number> = {};
        mockRecent.forEach((p: any) => {
          const tName = p.type_name || 'Plot';
          byTypeCounts[tName] = (byTypeCounts[tName] || 0) + 1;
        });

        setMetrics({
          totalAvailable: mockRecent.filter((p: any) => p.status === 'available').length,
          byType: byTypeCounts,
          activeBuyers: mockBuyers.filter((b: any) => b.status === 'active').length,
        });
        return;
      }

      // Fetch active sectors
      const { data: sData } = await supabase.from('sectors').select('*').eq('is_deleted', false).order('name');
      if (sData) setSectors(sData);

      // Fetch types
      const { data: tData } = await supabase.from('property_types').select('*').order('sort_order');
      if (tData) setPropertyTypes(tData);

      // Fetch dashboard metrics
      const { count: availCount } = await supabase
        .from('properties')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false)
        .eq('status', 'available');

      const { count: buyersCount } = await supabase
        .from('buyers')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false)
        .eq('status', 'active');

      setMetrics((prev) => ({
        ...prev,
        totalAvailable: availCount || 0,
        activeBuyers: buyersCount || 0,
      }));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadReferencesAndMetrics();
  }, []);

  // Sync state to URL Query String (debounced)
  useEffect(() => {
    const params = new URLSearchParams();
    if (minPriceVal) {
      params.set('minP', minPriceVal);
      params.set('minU', minPriceUnit);
    }
    if (maxPriceVal) {
      params.set('maxP', maxPriceVal);
      params.set('maxU', maxPriceUnit);
    }
    if (sectorInput.trim()) params.set('sector', sectorInput.trim());
    if (selectedTypes.length > 0) params.set('types', selectedTypes.join(','));
    if (sortBy !== 'newest') params.set('sort', sortBy);
    if (currentPage > 1) params.set('page', String(currentPage));
    if (showPhone) params.set('showPhone', 'true');

    setSearchParams(params, { replace: true });
  }, [
    minPriceVal,
    minPriceUnit,
    maxPriceVal,
    maxPriceUnit,
    sectorInput,
    selectedTypes,
    sortBy,
    currentPage,
    showPhone,
    setSearchParams,
  ]);

  // Execute Search query
  const executeSearch = useCallback(async () => {
    setIsLoading(true);
    try {
      const minRupees = parsePriceInput(minPriceVal, minPriceUnit);
      const maxRupees = parsePriceInput(maxPriceVal, maxPriceUnit);

      const trimmedSector = sectorInput.trim();
      let sectorIds: string[] | null = null;
      if (trimmedSector) {
        const matched = sectors.filter((s) =>
          s.name.toLowerCase().includes(trimmedSector.toLowerCase())
        );
        if (matched.length > 0) {
          sectorIds = matched.map((s) => s.id);
        } else {
          sectorIds = ['00000000-0000-0000-0000-000000000000'];
        }
      }

      const typeIds = selectedTypes.length > 0 ? selectedTypes : null;
      const limit = 20;
      const offset = (currentPage - 1) * limit;

      if (!isSupabaseConfigured) {
        // Mock searching
        const all: any[] = JSON.parse(localStorage.getItem('re_mock_properties') || '[]');
        let filtered = all.filter((p) => !p.is_deleted);

        if (minRupees !== null) filtered = filtered.filter((p) => p.price >= minRupees);
        if (maxRupees !== null) filtered = filtered.filter((p) => p.price <= maxRupees);
        if (trimmedSector) {
          const q = trimmedSector.toLowerCase();
          filtered = filtered.filter(
            (p) => p.sector_name?.toLowerCase().includes(q) || p.location?.toLowerCase().includes(q)
          );
        }
        if (typeIds) filtered = filtered.filter((p) => typeIds.includes(p.type_id));

        // Sorting
        filtered.sort((a, b) => {
          if (sortBy === 'price_asc') return a.price - b.price;
          if (sortBy === 'price_desc') return b.price - a.price;
          return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
        });

        const paginated = filtered.slice(offset, offset + limit).map((p) => ({
          ...p,
          phone: showPhone ? p._mockPhone : null,
          contact_name: showPhone ? p._mockContactName : null,
        }));

        setProperties(paginated);
        setTotalCount(filtered.length);
        setIsLoading(false);
        return;
      }

      // Live Supabase RPC call
      const { data, error } = await supabase.rpc('search_properties', {
        p_min_price: minRupees,
        p_max_price: maxRupees,
        p_sector_ids: sectorIds,
        p_type_ids: typeIds,
        p_statuses: ['available'],
        p_plot_id: null,
        p_include_phone: showPhone, // Controls whether property_contacts is joined or returned as NULL
        p_sort: sortBy,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) throw error;

      if (data) {
        setProperties(data);
        const count = data.length > 0 ? Number(data[0].total_count) : 0;
        setTotalCount(count);
      } else {
        setProperties([]);
        setTotalCount(0);
      }
    } catch (err: any) {
      const isDnsOrNetwork = err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
      showToast({
        type: 'error',
        title: isDnsOrNetwork ? 'Database Connection Error' : 'Search Error',
        message: isDnsOrNetwork
          ? 'Unable to reach Supabase. Please verify your Supabase Project URL in .env matches your dashboard.'
          : (err.message || 'Failed to search properties')
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    minPriceVal,
    minPriceUnit,
    maxPriceVal,
    maxPriceUnit,
    sectorInput,
    sectors,
    selectedTypes,
    showPhone,
    sortBy,
    currentPage,
    showToast,
  ]);

  // Debounced search trigger
  useEffect(() => {
    const handler = setTimeout(() => {
      executeSearch();
    }, 250);
    return () => clearTimeout(handler);
  }, [executeSearch]);

  // Quick range chip click handler
  const handleQuickRange = (range: typeof quickRanges[0]) => {
    setMinPriceVal(range.minVal);
    setMinPriceUnit(range.minUnit as PriceUnit);
    setMaxPriceVal(range.maxVal);
    setMaxPriceUnit(range.maxUnit as PriceUnit);
    setCurrentPage(1);
  };

  // Clear all filters ("Fetch All Properties")
  const handleFetchAll = () => {
    setMinPriceVal('');
    setMaxPriceVal('');
    setSectorInput('');
    setSelectedTypes([]);
    setCurrentPage(1);
  };

  // Reset to default
  const handleReset = () => {
    setMinPriceVal('');
    setMaxPriceVal('');
    setSectorInput('');
    setSelectedTypes([]);
    setShowPhone(false);
    setSortBy('newest');
    setCurrentPage(1);
  };

  // Multi-type toggle
  const toggleType = (typeId: string) => {
    setSelectedTypes((prev) =>
      prev.includes(typeId) ? prev.filter((id) => id !== typeId) : [...prev, typeId]
    );
    setCurrentPage(1);
  };

  // Multi-select for WhatsApp / Export
  const toggleSelectProperty = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllCurrentPage = () => {
    if (selectedIds.size === properties.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(properties.map((p) => p.id)));
    }
  };

  // Prepare selected properties for WhatsApp / CSV
  const selectedPropertiesList: WhatsAppPropertyItem[] = useMemo(() => {
    return properties
      .filter((p) => selectedIds.has(p.id))
      .map((p) => ({
        plot_id: p.plot_id,
        sector_name: p.sector_name,
        location: p.location,
        type_name: p.type_name,
        price: p.price,
        area_size: p.area_size,
        area_unit: p.area_unit,
        phone: showPhone ? p.phone : null,
      }));
  }, [properties, selectedIds, showPhone]);

  // Share on WhatsApp
  const handleShareWhatsApp = () => {
    if (selectedPropertiesList.length === 0) {
      showToast({ type: 'warning', title: 'No Selection', message: 'Please select at least one property to share' });
      return;
    }

    const message = formatPropertiesMessage(selectedPropertiesList);
    const link = buildWhatsAppLink(null, message); // Open sharing with wa.me/?text=...
    window.open(link, '_blank');
  };

  // Copy WhatsApp Message to Clipboard
  const handleCopyMessage = async () => {
    if (selectedPropertiesList.length === 0) {
      showToast({ type: 'warning', title: 'No Selection', message: 'Please select at least one property to copy message' });
      return;
    }

    const message = formatPropertiesMessage(selectedPropertiesList);
    try {
      await navigator.clipboard.writeText(message);
      showToast({ type: 'success', title: 'Copied!', message: 'Formatted property message copied to clipboard' });
    } catch {
      showToast({ type: 'error', title: 'Copy Failed', message: 'Could not access clipboard' });
    }
  };

  // Fast 1-Tap Copy Single Property Data (Includes phone only if showPhone is checked)
  const handleCopySingleProperty = async (p: Property) => {
    const lines = [
      `Plot ID: ${p.plot_id}`,
      `Type: ${p.type_name || 'Property'}`,
      `Sector: ${p.sector_name || 'N/A'}`,
      `Location: ${p.location}${p.house_no ? ` (${p.house_no})` : ''}`,
      `Price: ${formatPrice(p.price)}`,
      p.area_size ? `Area: ${p.area_size} ${p.area_unit || ''}` : null,
      `Status: ${p.status ? p.status.toUpperCase() : 'AVAILABLE'}`,
      p.details ? `Details: ${p.details}` : null,
      ...(showPhone && p.phone
        ? [
            `Owner: ${p.contact_name || 'Owner'}`,
            `Contact: ${normalizePhone(p.phone).formatted || p.phone}`,
          ]
        : []),
    ].filter(Boolean);

    const textToCopy = lines.join('\n');
    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast({
        type: 'success',
        title: 'Copied!',
        message: `Plot ${p.plot_id} data copied to clipboard`,
      });
    } catch {
      showToast({
        type: 'error',
        title: 'Copy Failed',
        message: 'Could not access clipboard',
      });
    }
  };

  // Export Filtered Results to CSV (Respects phone toggle)
  const handleExportCsv = () => {
    if (properties.length === 0) {
      showToast({ type: 'warning', title: 'Empty Results', message: 'No properties found to export' });
      return;
    }

    const headers = [
      'Plot ID',
      'Sector',
      'Location',
      'House No',
      'Price (Rupees)',
      'Price (Formatted)',
      'Type',
      'Area Size',
      'Area Unit',
      'Status',
      'Details',
      ...(showPhone ? ['Owner Name', 'Owner Phone'] : []),
    ];

    const rows = properties.map((p) => [
      p.plot_id,
      p.sector_name || '',
      p.location,
      p.house_no || '',
      p.price,
      formatPrice(p.price),
      p.type_name || '',
      p.area_size || '',
      p.area_unit || '',
      p.status,
      p.details || '',
      ...(showPhone ? [p.contact_name || '', p.phone || ''] : []),
    ]);

    const csvData = generateCsv(headers, rows);
    const filename = `real_estate_properties_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(filename, csvData);
    showToast({ type: 'success', title: 'Export Complete', message: `Downloaded ${properties.length} properties to CSV` });
  };

  const totalPages = Math.ceil(totalCount / 20) || 1;

  return (
    <div className="space-y-6">
      {/* Small Dashboard Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Available Units</span>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.totalAvailable}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <UsersIcon className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Active Buyers</span>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{metrics.activeBuyers}</p>
          </div>
        </div>

        <div className="col-span-2 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Active Inventory Types
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {propertyTypes.slice(0, 4).map((t) => (
              <span key={t.id} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-medium">
                {t.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Streamlined Filter Bar (Collapsible Drawer Trigger) */}
      <div className="md:hidden bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
          className="flex-1 flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors min-h-[44px]"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <span>Search Filters</span>
            {activeFiltersCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-brand-600 text-white text-[10px] font-bold">
                {activeFiltersCount}
              </span>
            )}
          </div>
          {isMobileFiltersOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        <button
          type="button"
          onClick={handleFetchAll}
          className="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/40 min-h-[44px] whitespace-nowrap"
        >
          Fetch All
        </button>
      </div>

      {/* Main Filter & Search Control Panel (Collapsible Drawer on Mobile, Full on Desktop) */}
      <div
        className={`${
          isMobileFiltersOpen ? 'block' : 'hidden'
        } md:block bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-md space-y-5 transition-all`}
      >
        {/* Mobile Header Inside Filter Drawer with Close Button */}
        <div className="flex md:hidden items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <span className="text-sm font-bold text-slate-900 dark:text-white">Filter Properties</span>
            {activeFiltersCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300 text-xs font-bold">
                {activeFiltersCount} Active
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsMobileFiltersOpen(false)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[38px] min-w-[38px] flex items-center justify-center"
            aria-label="Close filters"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* 1. Property Types (Multi-Select) - Natural Pill Tags */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Property Types <span className="text-slate-400 font-normal">(Multi-Select)</span>
            </span>
            {selectedTypes.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedTypes([])}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-semibold"
              >
                Clear all ({selectedTypes.length})
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {propertyTypes.map((type) => {
              const active = selectedTypes.includes(type.id);
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => toggleType(type.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all select-none border min-h-[38px] ${
                    active
                      ? 'border-brand-600 bg-brand-600 text-white shadow-md shadow-brand-500/25 ring-2 ring-brand-500/30'
                      : 'border-slate-200 dark:border-slate-700/80 bg-slate-100/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-800'
                  }`}
                >
                  {active && <Check className="w-3.5 h-3.5 text-white shrink-0 stroke-[3]" />}
                  <span>{type.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Quick Budget Filters - Sleek Pill Tags */}
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Quick Budget Filters
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {quickRanges.map((range, idx) => {
              const isActive =
                minPriceVal === range.minVal &&
                minPriceUnit === range.minUnit &&
                maxPriceVal === range.maxVal &&
                maxPriceUnit === range.maxUnit;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleQuickRange(range)}
                  className={`px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all min-h-[34px] flex items-center justify-center ${
                    isActive
                      ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                      : 'border-slate-200 dark:border-slate-700/70 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-300'
                  }`}
                >
                  <span>{range.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Balanced 2-Column Row: Sector / Colony (Left) & Price Range (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-1">
          {/* Left Column: Sector / Colony (Input with Dropdown Suggestions) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Sector / Colony
              </label>
              <span className="text-[11px] text-slate-400">Type or pick from list</span>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. Mohan Nagar, Sector 3, Sector 14..."
                value={sectorInput}
                onFocus={() => setIsSectorDropdownOpen(true)}
                onBlur={() => {
                  setTimeout(() => setIsSectorDropdownOpen(false), 200);
                }}
                onChange={(e) => {
                  setSectorInput(e.target.value);
                  setIsSectorDropdownOpen(true);
                  setCurrentPage(1);
                }}
                className="w-full py-2.5 px-3.5 pl-9 pr-9 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white font-medium"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              {sectorInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSectorInput('');
                    setIsSectorDropdownOpen(false);
                    setCurrentPage(1);
                  }}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Clear sector"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Instant Suggestion Dropdown as user types */}
              {isSectorDropdownOpen && filteredSectors.length > 0 && (
                <div className="absolute z-30 left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden py-1 max-h-60 overflow-y-auto">
                  <div className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800/80">
                    {sectorInput.trim() ? `Matching Sectors (${filteredSectors.length})` : 'All Available Sectors'}
                  </div>
                  {filteredSectors.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSectorInput(s.name);
                        setIsSectorDropdownOpen(false);
                        setCurrentPage(1);
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs sm:text-sm hover:bg-brand-50 dark:hover:bg-slate-800/80 flex items-center justify-between transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-brand-100 dark:group-hover:bg-brand-950 flex items-center justify-center text-slate-500 group-hover:text-brand-600 transition-colors">
                          <MapPin className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-brand-600 dark:group-hover:text-brand-400">
                          {s.name}
                        </span>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-brand-500 tracking-wider">
                        Select
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Price Range (Min & Max with Lakh/Cr) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Price Range (Inclusive)
              </label>
              <span className="text-[11px] text-slate-400">Min to Max</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {/* Min Price */}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Min (e.g. 50)"
                  value={minPriceVal}
                  onChange={(e) => {
                    setMinPriceVal(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="flex-1 min-w-0 py-2.5 px-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                />
                <select
                  value={minPriceUnit}
                  onChange={(e) => {
                    setMinPriceUnit(e.target.value as PriceUnit);
                    setCurrentPage(1);
                  }}
                  className="w-20 py-2.5 px-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold dark:text-white text-center"
                >
                  <option value="Lakh">Lakh</option>
                  <option value="Cr">Cr</option>
                </select>
              </div>

              {/* Max Price */}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Max (e.g. 2)"
                  value={maxPriceVal}
                  onChange={(e) => {
                    setMaxPriceVal(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="flex-1 min-w-0 py-2.5 px-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                />
                <select
                  value={maxPriceUnit}
                  onChange={(e) => {
                    setMaxPriceUnit(e.target.value as PriceUnit);
                    setCurrentPage(1);
                  }}
                  className="w-20 py-2.5 px-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold dark:text-white text-center"
                >
                  <option value="Cr">Cr</option>
                  <option value="Lakh">Lakh</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Toolbar: Fetch All, Reset, Show Phone Security Toggle, Export */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFetchAll}
              className="py-2 px-3 rounded-xl text-xs font-semibold bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 hover:bg-brand-100 min-h-[44px]"
            >
              Fetch All Properties
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="py-2 px-3 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 min-h-[44px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Show Phone Security Checkbox (Default UNCHECKED) */}
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none bg-amber-50/60 dark:bg-amber-950/30 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 min-h-[44px]">
              <input
                type="checkbox"
                checked={showPhone}
                onChange={(e) => setShowPhone(e.target.checked)}
                className="w-4 h-4 rounded border-amber-300 text-brand-600 focus:ring-brand-500"
              />
              <div className="flex items-center gap-1.5">
                {showPhone ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-amber-600" />}
                <span>Show Owner Phone</span>
              </div>
            </label>

            <button
              type="button"
              onClick={handleExportCsv}
              className="py-2 px-3.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 min-h-[44px]"
            >
              <Download className="w-3.5 h-3.5 text-brand-600" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Mobile Done / Apply Button */}
        <div className="pt-2 md:hidden">
          <button
            type="button"
            onClick={() => setIsMobileFiltersOpen(false)}
            className="w-full py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs transition-colors min-h-[44px] shadow-sm"
          >
            Apply Filters & View Results
          </button>
        </div>
      </div>

      {/* Action Bar for Selected Properties: WhatsApp Share & Copy */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={selectAllCurrentPage}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 py-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px]"
          >
            {selectedIds.size > 0 && selectedIds.size === properties.length ? (
              <CheckSquare className="w-4 h-4 text-brand-600" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            <span>Select All ({selectedIds.size} selected)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShareWhatsApp}
            disabled={selectedIds.size === 0}
            className="py-2 px-3.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-1.5 min-h-[44px] shadow-sm"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Share Selected on WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={handleCopyMessage}
            disabled={selectedIds.size === 0}
            className="py-2 px-3 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1 min-h-[44px]"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Message</span>
          </button>
        </div>
      </div>

      {/* Results Header: Count & Sorting */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Found <span className="font-bold text-slate-900 dark:text-white">{totalCount}</span> properties
        </p>

        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-slate-400" />
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setCurrentPage(1);
            }}
            className="py-1.5 px-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold dark:text-white"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="oldest">Sort: Oldest First</option>
          </select>
        </div>
      </div>

      {/* Results View: Mobile Cards & Desktop Table */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-500">
          <div className="inline-block w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin mb-2" />
          <p className="text-sm">Loading properties...</p>
        </div>
      ) : properties.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500">
          <Building className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-1">No Matching Properties Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            Try adjusting your budget or clearing filters to view all properties.
          </p>
          <button
            onClick={handleFetchAll}
            className="py-2 px-4 rounded-xl text-xs font-semibold bg-brand-600 text-white"
          >
            Clear Filters & View All
          </button>
        </div>
      ) : (
        <>
          {/* Mobile Cards View (Visible on < md screens, 360px optimized) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {properties.map((p) => {
              const isSelected = selectedIds.has(p.id);
              const cleanContactPhone = p.phone ? normalizePhone(p.phone).raw : '';

              return (
                <div
                  key={p.id}
                  className={`p-4 rounded-2xl bg-white dark:bg-slate-900 border transition-all ${
                    isSelected
                      ? 'border-brand-500 bg-brand-50/20 dark:bg-brand-950/20 shadow-md'
                      : 'border-slate-200 dark:border-slate-800 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSelectProperty(p.id)}
                        className="p-1 text-slate-400 hover:text-brand-600 min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-brand-600" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                      <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                        {p.plot_id}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCopySingleProperty(p)}
                        title="Copy property data to clipboard"
                        className="py-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 text-xs font-medium flex items-center gap-1 transition-colors min-h-[30px]"
                      >
                        <Copy className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                        <span>Copy Data</span>
                      </button>

                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          p.status === 'available'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : p.status === 'hold'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1">
                    <div className="flex items-baseline justify-between">
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        {p.type_name || 'Property'}
                      </h4>
                      <span className="font-extrabold text-brand-600 dark:text-brand-400 text-base">
                        {formatPrice(p.price)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Sector: <span className="font-medium text-slate-900 dark:text-slate-200">{p.sector_name || 'N/A'}</span>
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Address: <span className="font-medium">{p.location}</span> {p.house_no && `(${p.house_no})`}
                    </p>
                    {p.area_size && (
                      <p className="text-xs text-slate-500">
                        Area: {p.area_size} {p.area_unit}
                      </p>
                    )}
                    {p.details && (
                      <p className="text-xs text-slate-500 italic mt-1 line-clamp-2">
                        &ldquo;{p.details}&rdquo;
                      </p>
                    )}
                  </div>

                  {/* Phone / Contact Strip (If showPhone is enabled) */}
                  {showPhone && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Owner Contact</span>
                        <span className="text-xs font-semibold">{p.contact_name || 'Owner'}</span>
                        {p.phone && (
                          <span className="text-[11px] font-mono text-slate-500 block">
                            {normalizePhone(p.phone).formatted}
                          </span>
                        )}
                      </div>
                      {p.phone ? (
                        <a
                          href={`https://wa.me/91${cleanContactPhone}?text=Hello,%20inquiring%20about%20Plot%20${p.plot_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors min-h-[40px]"
                          title="WhatsApp Owner"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>WhatsApp</span>
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">No phone</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (Visible on md+ screens) */}
          <div className="hidden md:block overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 w-12">
                    <button
                      type="button"
                      onClick={selectAllCurrentPage}
                      className="p-1 hover:text-brand-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      {selectedIds.size > 0 && selectedIds.size === properties.length ? (
                        <CheckSquare className="w-4 h-4 text-brand-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Plot ID</th>
                  <th className="py-3 px-4">Sector</th>
                  <th className="py-3 px-4">Location / No</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Area</th>
                  <th className="py-3 px-4">Status</th>
                  {showPhone && <th className="py-3 px-4">Owner Phone</th>}
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {properties.map((p) => {
                  const isSelected = selectedIds.has(p.id);
                  const cleanPhone = p.phone ? normalizePhone(p.phone).raw : '';

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                        isSelected ? 'bg-brand-50/30 dark:bg-brand-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => toggleSelectProperty(p.id)}
                          className="p-1 text-slate-400 hover:text-brand-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-brand-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-xs text-brand-700 dark:text-brand-300">
                        {p.plot_id}
                      </td>
                      <td className="py-3 px-4 font-medium">{p.sector_name || 'N/A'}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-white">{p.location}</div>
                        {p.house_no && <div className="text-xs text-slate-400">House: {p.house_no}</div>}
                      </td>
                      <td className="py-3 px-4">{p.type_name || 'Property'}</td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {formatPrice(p.price)}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {p.area_size ? `${p.area_size} ${p.area_unit}` : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`capitalize px-2 py-0.5 rounded text-xs font-semibold ${
                            p.status === 'available'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : p.status === 'hold'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      {showPhone && (
                        <td className="py-3 px-4">
                          {p.phone ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">{normalizePhone(p.phone).formatted}</span>
                              <a
                                href={`https://wa.me/91${cleanPhone}?text=Hello,%20inquiring%20about%20Plot%20${p.plot_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="WhatsApp Owner"
                                className="py-1 px-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-xs font-medium flex items-center gap-1 min-h-[36px] transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>WhatsApp</span>
                              </a>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleCopySingleProperty(p)}
                          title="Copy property data to clipboard"
                          className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 text-xs font-semibold transition-colors min-h-[34px]"
                        >
                          <Copy className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                          <span>Copy Data</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold disabled:opacity-40 flex items-center gap-1 min-h-[44px]"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev</span>
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold disabled:opacity-40 flex items-center gap-1 min-h-[44px]"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
