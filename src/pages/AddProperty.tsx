import React, { useState, useEffect } from 'react';
import {
  Building,
  Check,
  AlertTriangle,
  Loader2,
  Trash2,
  Edit3,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { parsePriceInput, formatPrice, getPricePreview, type PriceUnit } from '../lib/price';
import { normalizePhone } from '../lib/phone';
import type { Property, Sector, PropertyType, PropertyStatus, AreaUnit, DuplicatePhoneMatch } from '../types/database';

export const AddProperty: React.FC = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  // Safe integer-only price→display string: avoids float rounding noise
  const priceToDisplayVal = (rupees: number): { val: string; unit: PriceUnit } => {
    const ONE_CR = 10_000_000;
    const ONE_LAKH = 100_000;
    if (rupees >= ONE_CR) {
      // Express in Cr with max 2 decimal places, trimmed
      const intPart = Math.floor(rupees / ONE_CR);
      const remLakhs = Math.round((rupees % ONE_CR) / ONE_LAKH);
      const val = remLakhs === 0 ? String(intPart) : `${intPart}.${String(remLakhs).padStart(2, '0').replace(/0+$/, '')}`;
      return { val, unit: 'Cr' };
    }
    const intPart = Math.floor(rupees / ONE_LAKH);
    const remThousands = Math.round((rupees % ONE_LAKH) / 1000);
    const val = remThousands === 0 ? String(intPart) : `${intPart}.${String(remThousands).padStart(2, '0').replace(/0+$/, '')}`;
    return { val, unit: 'Lakh' };
  };

  // Reference Data
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [recentProperties, setRecentProperties] = useState<Property[]>([]);

  // Form State
  const [sectorMode, setSectorMode] = useState<'select' | 'new'>('select');
  const [selectedSectorId, setSelectedSectorId] = useState('');
  const [newSectorName, setNewSectorName] = useState('');

  const [location, setLocation] = useState('');
  const [houseNo, setHouseNo] = useState('');
  const [priceValue, setPriceValue] = useState('');
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('Cr');
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [areaSize, setAreaSize] = useState('');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('sq yard');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<PropertyStatus>('available');

  // Phone duplicate warning state
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicatePhoneMatch[]>([]);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Editing state
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch reference lists and recent entries
  const loadData = async () => {
    try {
      if (!isSupabaseConfigured) {
        // Fallback mock data when Supabase is not yet connected
        const mockSectors: Sector[] = [
          { id: 'sec-1', name: 'Sector 14', created_at: '', updated_at: '', is_deleted: false },
          { id: 'sec-2', name: 'Sector 15', created_at: '', updated_at: '', is_deleted: false },
          { id: 'sec-3', name: 'Golf Course Road', created_at: '', updated_at: '', is_deleted: false },
          { id: 'sec-4', name: 'DLF Phase 1', created_at: '', updated_at: '', is_deleted: false },
        ];
        const mockTypes: PropertyType[] = [
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
        setSelectedTypeId(mockTypes[0].id);

        const savedRecent = localStorage.getItem('re_mock_properties');
        if (savedRecent) {
          setRecentProperties(JSON.parse(savedRecent));
        }
        return;
      }

      // Fetch sectors
      const { data: secData } = await supabase
        .from('sectors')
        .select('*')
        .eq('is_deleted', false)
        .order('name');
      if (secData) setSectors(secData);

      // Fetch property types
      const { data: typeData } = await supabase
        .from('property_types')
        .select('*')
        .order('sort_order');
      if (typeData) {
        setPropertyTypes(typeData);
        if (typeData.length > 0 && !selectedTypeId) {
          setSelectedTypeId(typeData[0].id);
        }
      }

      // Fetch recent 10 properties (Direct select on properties table; notice contact phone is never exposed here)
      const { data: propsData } = await supabase
        .from('properties')
        .select(`
          id,
          plot_no,
          plot_id,
          sector_id,
          location,
          house_no,
          price,
          type_id,
          area_size,
          area_unit,
          details,
          status,
          created_at,
          sectors(name),
          property_types(name)
        `)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (propsData) {
        const formatted: Property[] = propsData.map((p: any) => ({
          ...p,
          sector_name: p.sectors?.name,
          type_name: p.property_types?.name,
        }));
        setRecentProperties(formatted);
      }
    } catch {
      showToast({ type: 'error', title: 'Network Error', message: 'Failed to load reference data' });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Check duplicate phone via phone_exists() RPC
  useEffect(() => {
    const norm = normalizePhone(ownerPhone);
    if (!norm.isValid) {
      setDuplicateMatches([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingPhone(true);
      try {
        if (!isSupabaseConfigured) {
          // Mock duplicate check
          const mockRecent = JSON.parse(localStorage.getItem('re_mock_properties') || '[]');
          const matches = mockRecent
            .filter((p: any) => p._mockPhone === norm.raw && p.id !== editingPropertyId)
            .map((p: any) => ({ plot_id: p.plot_id, location: p.location, status: p.status }));
          setDuplicateMatches(matches);
          setIsCheckingPhone(false);
          return;
        }

        const { data, error } = await supabase.rpc('phone_exists', {
          p_phone: norm.raw,
          p_exclude_property_id: editingPropertyId || null,
        });

        if (!error && Array.isArray(data)) {
          setDuplicateMatches(data);
        }
      } catch {
        // Warning only, do not block
      } finally {
        setIsCheckingPhone(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [ownerPhone, editingPropertyId]);

  // Reset form
  const resetForm = () => {
    setSectorMode('select');
    setSelectedSectorId('');
    setNewSectorName('');
    setLocation('');
    setHouseNo('');
    setPriceValue('');
    setPriceUnit('Cr');
    if (propertyTypes.length > 0) setSelectedTypeId(propertyTypes[0].id);
    setAreaSize('');
    setAreaUnit('sq yard');
    setOwnerName('');
    setOwnerPhone('');
    setDetails('');
    setStatus('available');
    setDuplicateMatches([]);
    setErrors({});
    setEditingPropertyId(null);
  };

  // Validate form
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (sectorMode === 'select' && !selectedSectorId) {
      newErrors.sector = 'Please select a sector or choose to create a new one';
    } else if (sectorMode === 'new' && !newSectorName.trim()) {
      newErrors.sector = 'Sector name cannot be blank';
    }

    if (!location.trim()) {
      newErrors.location = 'Location / Address is required';
    }

    const parsedPrice = parsePriceInput(priceValue, priceUnit);
    if (!parsedPrice || parsedPrice <= 0) {
      newErrors.price = 'Enter a valid positive price (max 2 decimals)';
    }

    if (!selectedTypeId) {
      newErrors.type = 'Please select a property type';
    }

    const normPhone = normalizePhone(ownerPhone);
    if (!normPhone.isValid) {
      newErrors.phone = normPhone.error || 'Valid 10-digit Indian phone number required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      let finalSectorId = selectedSectorId;

      // Handle new sector creation
      if (sectorMode === 'new') {
        const cleanName = newSectorName.trim();
        // Check local sector de-duplication
        const existing = sectors.find((s) => s.name.trim().toLowerCase() === cleanName.toLowerCase());
        if (existing) {
          finalSectorId = existing.id;
        } else {
          if (!isSupabaseConfigured) {
            const newSec: Sector = {
              id: 'sec-' + Date.now(),
              name: cleanName,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              is_deleted: false,
            };
            setSectors((prev) => [...prev, newSec]);
            finalSectorId = newSec.id;
          } else {
            const { data: newSecData, error: secError } = await supabase
              .from('sectors')
              .insert({ name: cleanName })
              .select('id, name')
              .single();

            if (secError) {
              throw new Error(`Failed to create sector: ${secError.message}`);
            }
            finalSectorId = newSecData.id;
            await loadData();
          }
        }
      }

      const parsedPrice = parsePriceInput(priceValue, priceUnit)!;
      const cleanPhone = normalizePhone(ownerPhone).raw;

      if (!isSupabaseConfigured) {
        // Mock save
        const savedList = JSON.parse(localStorage.getItem('re_mock_properties') || '[]');
        if (editingPropertyId) {
          const updated = savedList.map((p: any) =>
            p.id === editingPropertyId
              ? {
                  ...p,
                  sector_id: finalSectorId,
                  sector_name: sectors.find((s) => s.id === finalSectorId)?.name,
                  location: location.trim(),
                  house_no: houseNo.trim() || null,
                  price: parsedPrice,
                  type_id: selectedTypeId,
                  type_name: propertyTypes.find((t) => t.id === selectedTypeId)?.name,
                  area_size: areaSize ? Number(areaSize) : null,
                  area_unit: areaUnit,
                  details: details.trim() || null,
                  status,
                  _mockContactName: ownerName.trim() || null,
                  _mockPhone: cleanPhone,
                }
              : p
          );
          localStorage.setItem('re_mock_properties', JSON.stringify(updated));
          showToast({ type: 'success', title: 'Property Updated', message: 'Details updated successfully' });
        } else {
          const nextPlotNo = savedList.length + 1;
          const newPlotId = `P-${String(nextPlotNo).padStart(4, '0')}`;
          const newProp = {
            id: 'mock-prop-' + Date.now(),
            plot_no: nextPlotNo,
            plot_id: newPlotId,
            sector_id: finalSectorId,
            sector_name: sectors.find((s) => s.id === finalSectorId)?.name,
            location: location.trim(),
            house_no: houseNo.trim() || null,
            price: parsedPrice,
            type_id: selectedTypeId,
            type_name: propertyTypes.find((t) => t.id === selectedTypeId)?.name,
            area_size: areaSize ? Number(areaSize) : null,
            area_unit: areaUnit,
            details: details.trim() || null,
            status,
            created_at: new Date().toISOString(),
            _mockContactName: ownerName.trim() || null,
            _mockPhone: cleanPhone,
          };
          localStorage.setItem('re_mock_properties', JSON.stringify([newProp, ...savedList]));
          showToast({
            type: 'success',
            title: `Property Saved!`,
            message: `New Plot ID: ${newPlotId} registered successfully.`,
            duration: 6000,
          });
        }
        resetForm();
        loadData();
        setIsSubmitting(false);
        return;
      }

      // Live Supabase RPC call
      if (editingPropertyId) {
        const { error: updateError } = await supabase.rpc('update_property', {
          p_id: editingPropertyId,
          p_sector_id: finalSectorId,
          p_location: location.trim(),
          p_house_no: houseNo.trim() || null,
          p_price: parsedPrice,
          p_type_id: selectedTypeId,
          p_area_size: areaSize ? Number(areaSize) : null,
          p_area_unit: areaUnit || null,
          p_details: details.trim() || null,
          p_status: status,
          p_contact_name: ownerName.trim() || null,
          p_phone: cleanPhone,
        });

        if (updateError) throw updateError;

        showToast({
          type: 'success',
          title: 'Property Updated',
          message: 'Property details and contact updated successfully.',
        });
      } else {
        const { data, error: createError } = await supabase.rpc('create_property', {
          p_sector_id: finalSectorId,
          p_location: location.trim(),
          p_house_no: houseNo.trim() || null,
          p_price: parsedPrice,
          p_type_id: selectedTypeId,
          p_area_size: areaSize ? Number(areaSize) : null,
          p_area_unit: areaUnit || null,
          p_details: details.trim() || null,
          p_status: status,
          p_contact_name: ownerName.trim() || null,
          p_phone: cleanPhone,
        });

        if (createError) throw createError;

        const newPlotId = data?.[0]?.plot_id || 'P-0000';
        showToast({
          type: 'success',
          title: `Plot ID: ${newPlotId}`,
          message: `Saved successfully! Assigned ${newPlotId}`,
          duration: 6000,
        });
      }

      resetForm();
      await loadData();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'An error occurred while saving the property.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Start Editing Property (Calls get_property_for_edit)
  const handleEditClick = async (propId: string) => {
    setEditingPropertyId(propId);
    try {
      if (!isSupabaseConfigured) {
        const mockRecent = JSON.parse(localStorage.getItem('re_mock_properties') || '[]');
        const p = mockRecent.find((x: any) => x.id === propId);
        if (p) {
          setSelectedSectorId(p.sector_id);
          setSectorMode('select');
          setLocation(p.location);
          setHouseNo(p.house_no || '');
          // price - use integer arithmetic to avoid float noise
          const { val, unit } = priceToDisplayVal(p.price);
          setPriceValue(val);
          setPriceUnit(unit);
          setSelectedTypeId(p.type_id);
          setAreaSize(p.area_size ? String(p.area_size) : '');
          setAreaUnit(p.area_unit || 'sq yard');
          setOwnerName(p._mockContactName || '');
          setOwnerPhone(p._mockPhone || '');
          setDetails(p.details || '');
          setStatus(p.status);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }

      const { data, error } = await supabase.rpc('get_property_for_edit', { p_id: propId });
      if (error) throw error;
      if (data && data.length > 0) {
        const item = data[0];
        setSelectedSectorId(item.sector_id);
        setSectorMode('select');
        setLocation(item.location);
        setHouseNo(item.house_no || '');
        const { val: pVal, unit: pUnit } = priceToDisplayVal(item.price);
        setPriceValue(pVal);
        setPriceUnit(pUnit);
        setSelectedTypeId(item.type_id);
        setAreaSize(item.area_size ? String(item.area_size) : '');
        setAreaUnit((item.area_unit as AreaUnit) || 'sq yard');
        setOwnerName(item.contact_name || '');
        setOwnerPhone(item.phone || '');
        setDetails(item.details || '');
        setStatus(item.status as PropertyStatus);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: any) {
      showToast({ type: 'error', title: 'Edit Failed', message: err.message || 'Could not fetch property for edit' });
      setEditingPropertyId(null);
    }
  };

  // Delete property (Admin only)
  const handleDeleteProperty = async (propId: string) => {
    if (!isAdmin) {
      showToast({ type: 'error', title: 'Permission Denied', message: 'Only administrators can delete properties.' });
      return;
    }

    try {
      if (!isSupabaseConfigured) {
        const saved = JSON.parse(localStorage.getItem('re_mock_properties') || '[]');
        const filtered = saved.filter((p: any) => p.id !== propId);
        localStorage.setItem('re_mock_properties', JSON.stringify(filtered));
        showToast({ type: 'success', title: 'Deleted', message: 'Property soft deleted successfully' });
        setDeletingId(null);
        loadData();
        return;
      }

      const { error } = await supabase.rpc('soft_delete_property', { p_id: propId });
      if (error) throw error;

      showToast({ type: 'success', title: 'Deleted', message: 'Property soft deleted successfully' });
      setDeletingId(null);
      await loadData();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Delete Failed', message: err.message || 'Failed to soft delete property' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <Building className="w-7 h-7 text-brand-600 dark:text-brand-400" />
            <span>{editingPropertyId ? 'Edit Property' : 'Add New Property'}</span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {editingPropertyId
              ? 'Update property details and contact information'
              : 'Register a property to the dealership inventory'}
          </p>
        </div>

        {editingPropertyId && (
          <button
            type="button"
            onClick={resetForm}
            className="self-start sm:self-auto px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            Cancel Edit
          </button>
        )}
      </div>

      {/* Main Form Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Plot ID Notice (Read-only guarantee) */}
          <div className="p-4 rounded-2xl bg-brand-50/60 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                Plot Identifier
              </span>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">
                {editingPropertyId
                  ? 'Editing existing Plot ID'
                  : 'Auto-generated sequentially upon save (e.g. P-0001, P-0042)'}
              </p>
            </div>
            <span className="px-3 py-1.5 rounded-lg text-xs font-bold font-mono bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 border border-brand-300 dark:border-brand-700">
              {editingPropertyId ? 'FIXED' : 'AUTO-GEN'}
            </span>
          </div>

          {/* Section: Location & Sector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Sector Selector */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Sector / Colony <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setSectorMode(sectorMode === 'select' ? 'new' : 'select')}
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                >
                  {sectorMode === 'select' ? (
                    <>
                      <Plus className="w-3 h-3" />
                      <span>Create New Sector</span>
                    </>
                  ) : (
                    <span>Select Existing Sector</span>
                  )}
                </button>
              </div>

              {sectorMode === 'select' ? (
                <select
                  value={selectedSectorId}
                  onChange={(e) => setSelectedSectorId(e.target.value)}
                  className={`w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white ${
                    errors.sector ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <option value="">-- Choose a Sector --</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Enter new sector name (e.g. Sector 57 or Sushant Lok)"
                  value={newSectorName}
                  onChange={(e) => setNewSectorName(e.target.value)}
                  className={`w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white ${
                    errors.sector ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                  }`}
                />
              )}
              {errors.sector && <p className="text-xs text-rose-500 mt-1">{errors.sector}</p>}
            </div>

            {/* Location / Address */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Location / Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Near Community Center, 60ft Road"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={`w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white ${
                  errors.location ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                }`}
              />
              {errors.location && <p className="text-xs text-rose-500 mt-1">{errors.location}</p>}
            </div>

            {/* Plot/House No. */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Owner's Plot / House No. <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 142-B or Plot 23"
                value={houseNo}
                onChange={(e) => setHouseNo(e.target.value)}
                className="w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
              />
              <p className="text-[11px] text-slate-400 mt-1">Owner's private numbering. Not the system Plot ID.</p>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Listing Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PropertyStatus)}
                className="w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
              >
                <option value="available">Available</option>
                <option value="hold">On Hold</option>
                <option value="sold">Sold</option>
              </select>
            </div>
          </div>

          {/* Section: Price Input with Live Preview */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Price <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="e.g. 1.25 or 85"
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
                className={`flex-1 py-2.5 px-3.5 bg-white dark:bg-slate-900 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white font-medium ${
                  errors.price ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                }`}
              />
              <select
                value={priceUnit}
                onChange={(e) => setPriceUnit(e.target.value as PriceUnit)}
                className="w-28 py-2.5 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
              >
                <option value="Cr">Crore (Cr)</option>
                <option value="Lakh">Lakh</option>
              </select>
            </div>

            {/* Live Indian Notation Preview */}
            {priceValue && (
              <div className="mt-2 text-xs font-medium text-brand-600 dark:text-brand-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{getPricePreview(priceValue, priceUnit) || 'Invalid price entered'}</span>
              </div>
            )}
            {errors.price && <p className="text-xs text-rose-500 mt-1">{errors.price}</p>}
          </div>

          {/* Section: Property Type (Large Single-Select Tick Chips) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
              Property Type <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {propertyTypes.map((type) => {
                const isSelected = selectedTypeId === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setSelectedTypeId(type.id)}
                    className={`py-3 px-3.5 rounded-xl border text-sm font-medium flex items-center justify-between transition-all min-h-[48px] ${
                      isSelected
                        ? 'border-brand-600 bg-brand-50/80 text-brand-700 dark:bg-brand-950/60 dark:border-brand-500 dark:text-brand-200 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="truncate">{type.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>
            {errors.type && <p className="text-xs text-rose-500 mt-1">{errors.type}</p>}
          </div>

          {/* Section: Area Measurement */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Area Size <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 250"
                value={areaSize}
                onChange={(e) => setAreaSize(e.target.value)}
                className="w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Area Unit
              </label>
              <select
                value={areaUnit}
                onChange={(e) => setAreaUnit(e.target.value as AreaUnit)}
                className="w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
              >
                <option value="sq yard">Sq. Yard (Gaj)</option>
                <option value="gaj">Gaj</option>
                <option value="marla">Marla</option>
                <option value="kanal">Kanal</option>
                <option value="acre">Acre</option>
                <option value="sq ft">Sq. Ft</option>
              </select>
            </div>
          </div>

          {/* Section: Owner Contact Info (Isolated in DB) */}
          <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Owner Contact Details (Confidential)
              </span>
              <span className="text-[11px] text-amber-700 dark:text-amber-400">
                Protected by Database RLS
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Owner / Seller Name <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full py-2.5 px-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Owner Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="10-digit mobile (e.g. 9876543210)"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  className={`w-full py-2.5 px-3.5 bg-white dark:bg-slate-900 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white ${
                    errors.phone ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                  }`}
                />
                {errors.phone && <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>}
                {isCheckingPhone && (
                  <p className="text-[11px] text-slate-400 mt-1">Checking existing inventory...</p>
                )}
              </div>
            </div>

            {/* Duplicate Phone Warning Box (Warning ONLY, never blocks) */}
            {duplicateMatches.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-100/80 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-100 flex items-start gap-2.5 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold">Duplicate Phone Warning:</span> This contact number is already linked to existing listing(s):
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {duplicateMatches.map((m, idx) => (
                      <span key={idx} className="font-mono font-semibold px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-700">
                        {m.plot_id} ({m.location})
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] opacity-80">You can still save if this owner has multiple properties.</p>
                </div>
              </div>
            )}
          </div>

          {/* Details / Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              General Details / Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="e.g. East facing, 24m road, registry done, boundary wall constructed..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
            />
          </div>

          {/* Submit & Reset Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 px-6 rounded-xl font-semibold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 shadow-md shadow-brand-500/25 disabled:opacity-50 flex items-center justify-center gap-2 transition-all min-h-[44px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Property...</span>
                </>
              ) : (
                <span>{editingPropertyId ? 'Update Property' : 'Save Property'}</span>
              )}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={isSubmitting}
              className="py-3 px-6 rounded-xl font-medium border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 min-h-[44px]"
            >
              Reset Form
            </button>
          </div>
        </form>
      </div>

      {/* Section: Recent Entries List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recent Entries</h2>
          <button
            onClick={loadData}
            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {recentProperties.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500">
            No properties registered yet. Fill the form above to add your first listing!
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {recentProperties.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all"
              >
                <div className="flex items-start gap-3">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                    {item.plot_id}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{item.type_name || 'Property'}</span>
                      <span className="text-xs font-normal text-slate-500">in {item.sector_name || item.location}</span>
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      {item.location} {item.house_no && `(No: ${item.house_no})`}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <span className="font-semibold text-brand-600 dark:text-brand-400">{formatPrice(item.price)}</span>
                      {item.area_size && (
                        <span className="text-slate-500">
                          {item.area_size} {item.area_unit}
                        </span>
                      )}
                      <span
                        className={`capitalize px-2 py-0.5 rounded text-[11px] font-semibold ${
                          item.status === 'available'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : item.status === 'hold'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions: Edit & Delete */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleEditClick(item.id)}
                    className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40 text-xs font-medium flex items-center gap-1 min-h-[44px] min-w-[44px] justify-center"
                    title="Edit Property"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span className="sm:hidden">Edit</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setDeletingId(item.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Delete Property (Admin Only)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Soft Delete Property?</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              This property will be marked as deleted and hidden from search. The Plot ID will never be reused.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteProperty(deletingId)}
                className="px-4 py-2 text-sm rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
