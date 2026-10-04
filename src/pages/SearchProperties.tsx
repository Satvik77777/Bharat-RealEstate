import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Phone,
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

  const [selectedSector, setSelectedSector] = useState(searchParams.get('sector') || '');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    searchParams.get('types') ? searchParams.get('types')!.split(',').filter(Boolean) : []
  );
  const [selectedStatus, setSelectedStatus] = useState<string>(searchParams.get('status') || 'available');
  const [plotIdSearch, setPlotIdSearch] = useState(searchParams.get('plotId') || '');
  const [sortBy, setSortBy] = useState<string>(searchParams.get('sort') || 'newest');
  const [currentPage, setCurrentPage] = useState<number>(Number(searchParams.get('page')) || 1);

  // Phone visibility security toggle (default false - ensures phone is absent from response)
  const [showPhone, setShowPhone] = useState(searchParams.get('showPhone') === 'true');

  // Query Results
  const [properties, setProperties] = useState<Property[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Selected for WhatsApp sharing / export
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    if (selectedSector) params.set('sector', selectedSector);
    if (selectedTypes.length > 0) params.set('types', selectedTypes.join(','));
    if (selectedStatus) params.set('status', selectedStatus);
    if (plotIdSearch.trim()) params.set('plotId', plotIdSearch.trim());
    if (sortBy !== 'newest') params.set('sort', sortBy);
    if (currentPage > 1) params.set('page', String(currentPage));
    if (showPhone) params.set('showPhone', 'true');

    setSearchParams(params, { replace: true });
  }, [
    minPriceVal,
    minPriceUnit,
    maxPriceVal,
    maxPriceUnit,
    selectedSector,
    selectedTypes,
    selectedStatus,
    plotIdSearch,
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

      const sectorIds = selectedSector ? [selectedSector] : null;
      const typeIds = selectedTypes.length > 0 ? selectedTypes : null;
      const statuses = selectedStatus ? [selectedStatus] : null;
      const plotQuery = plotIdSearch.trim() || null;
      const limit = 20;
      const offset = (currentPage - 1) * limit;

      if (!isSupabaseConfigured) {
        // Mock searching
        const all: any[] = JSON.parse(localStorage.getItem('re_mock_properties') || '[]');
        let filtered = all.filter((p) => !p.is_deleted);

        if (minRupees !== null) filtered = filtered.filter((p) => p.price >= minRupees);
        if (maxRupees !== null) filtered = filtered.filter((p) => p.price <= maxRupees);
        if (sectorIds) filtered = filtered.filter((p) => sectorIds.includes(p.sector_id));
        if (typeIds) filtered = filtered.filter((p) => typeIds.includes(p.type_id));
        if (statuses) filtered = filtered.filter((p) => statuses.includes(p.status));
        if (plotQuery) {
          const q = plotQuery.toLowerCase().replace(/^p-?/, '');
          filtered = filtered.filter(
            (p) =>
              p.plot_id.toLowerCase().includes(plotQuery.toLowerCase()) ||
              String(p.plot_no) === q
          );
        }

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
        p_statuses: statuses,
        p_plot_id: plotQuery,
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
      showToast({ type: 'error', title: 'Search Error', message: err.message || 'Failed to search properties' });
    } finally {
      setIsLoading(false);
    }
  }, [
    minPriceVal,
    minPriceUnit,
    maxPriceVal,
    maxPriceUnit,
    selectedSector,
    selectedTypes,
    selectedStatus,
    plotIdSearch,
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
    setSelectedSector('');
    setSelectedTypes([]);
    setSelectedStatus('');
    setPlotIdSearch('');
    setCurrentPage(1);
  };

  // Reset to default
  const handleReset = () => {
    setMinPriceVal('');
    setMaxPriceVal('');
    setSelectedSector('');
    setSelectedTypes([]);
    setSelectedStatus('available');
    setPlotIdSearch('');
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

      {/* Main Filter & Search Control Panel */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-md space-y-5">
        {/* Quick Range Chips (Fills boxes so user sees exact numbers) */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 block">
            Quick Budget Filters
          </span>
          <div className="flex flex-wrap gap-2">
            {quickRanges.map((range, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleQuickRange(range)}
                className="py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/40 text-xs font-semibold transition-all min-h-[40px]"
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* Price Min/Max Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Minimum Price (Inclusive)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 50 or 1"
                value={minPriceVal}
                onChange={(e) => {
                  setMinPriceVal(e.target.value);
                  setCurrentPage(1);
                }}
                className="flex-1 py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
              />
              <select
                value={minPriceUnit}
                onChange={(e) => {
                  setMinPriceUnit(e.target.value as PriceUnit);
                  setCurrentPage(1);
                }}
                className="w-24 py-2 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold dark:text-white"
              >
                <option value="Lakh">Lakh</option>
                <option value="Cr">Cr</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Maximum Price (Inclusive)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 1 or 2"
                value={maxPriceVal}
                onChange={(e) => {
                  setMaxPriceVal(e.target.value);
                  setCurrentPage(1);
                }}
                className="flex-1 py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
              />
              <select
                value={maxPriceUnit}
                onChange={(e) => {
                  setMaxPriceUnit(e.target.value as PriceUnit);
                  setCurrentPage(1);
                }}
                className="w-24 py-2 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold dark:text-white"
              >
                <option value="Cr">Cr</option>
                <option value="Lakh">Lakh</option>
              </select>
            </div>
          </div>
        </div>

        {/* Sector, Plot ID Search, and Status */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Sector (Searchable select) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Sector / Colony
            </label>
            <select
              value={selectedSector}
              onChange={(e) => {
                setSelectedSector(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
            >
              <option value="">All Sectors</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Plot ID Search (accepts P-0012, p0012, or 12) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Plot ID Search
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. P-0012, p12, or 12"
                value={plotIdSearch}
                onChange={(e) => {
                  setPlotIdSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full py-2.5 px-3.5 pl-9 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white font-mono"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
            >
              <option value="">All Statuses</option>
              <option value="available">Available Only</option>
              <option value="hold">On Hold</option>
              <option value="sold">Sold</option>
            </select>
          </div>
        </div>

        {/* Multi-select Property Types */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
            Property Types (Multi-Select)
          </label>
          <div className="flex flex-wrap gap-2">
            {propertyTypes.map((type) => {
              const active = selectedTypes.includes(type.id);
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => toggleType(type.id)}
                  className={`py-1.5 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all min-h-[38px] ${
                    active
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 dark:border-brand-500 font-semibold'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  {active && <Check className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />}
                  <span>{type.name}</span>
                </button>
              );
            })}
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
                      </div>
                      {p.phone ? (
                        <div className="flex items-center gap-2">
                          <a
                            href={`tel:${cleanContactPhone}`}
                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 min-h-[44px] min-w-[44px] flex items-center justify-center"
                            title="Call Owner"
                          >
                            <Phone className="w-4 h-4 text-emerald-600" />
                          </a>
                          <a
                            href={`https://wa.me/91${cleanContactPhone}?text=Hello,%20inquiring%20about%20Plot%20${p.plot_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                            title="WhatsApp Owner"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        </div>
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
                                href={`tel:${cleanPhone}`}
                                title="Call"
                                className="p-1 rounded text-slate-400 hover:text-emerald-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </a>
                              <a
                                href={`https://wa.me/91${cleanPhone}?text=Hello,%20inquiring%20about%20Plot%20${p.plot_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="WhatsApp"
                                className="p-1 rounded text-slate-400 hover:text-emerald-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      )}
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
