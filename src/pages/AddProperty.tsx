import React, { useState, useEffect, useMemo } from 'react';
import {
  Building,
  Building2,
  Home,
  AlertTriangle,
  Loader2,
  Sparkles,
  Calculator,
  Compass,
  MapPin,
  X,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { parsePriceInput, getPricePreview, type PriceUnit } from '../lib/price';
import { normalizePhone } from '../lib/phone';
import { formatPropertyId } from '../lib/propertyFormat';
import type { Sector, PropertyType, PropertyStatus, AreaUnit, DuplicatePhoneMatch } from '../types/database';

export type PropertyCategory = 'residential' | 'commercial';
export type PropertySubType = 'plot' | 'home' | 'flat' | 'farmhouse' | 'shop' | 'agriculture' | 'industry' | 'other';

export const residentialOptions: { id: PropertySubType; label: string }[] = [
  { id: 'plot', label: 'Plot' },
  { id: 'home', label: 'Residential (House/Kothi)' },
  { id: 'flat', label: 'Flat / Apartment' },
  { id: 'farmhouse', label: 'Farmhouse' },
  { id: 'other', label: 'Other' },
];

export const commercialOptions: { id: PropertySubType; label: string }[] = [
  { id: 'plot', label: 'Plot' },
  { id: 'shop', label: 'Commercial' },
  { id: 'agriculture', label: 'Agricultural Land' },
  { id: 'industry', label: 'Industrial' },
  { id: 'other', label: 'Other' },
];

// Helper to match built-in subType to an existing PropertyType from database/mock
export const getTypeIdForSubType = (subType: PropertySubType, typesList: PropertyType[]): string => {
  if (subType === 'plot') {
    return typesList.find((t) => t.name.toLowerCase() === 'plot' || t.name.toLowerCase().includes('plot'))?.id || '';
  }
  if (subType === 'home') {
    return (
      typesList.find(
        (t) =>
          t.name.toLowerCase() === 'home' ||
          t.name.toLowerCase().includes('house') ||
          t.name.toLowerCase().includes('kothi') ||
          t.name.toLowerCase().includes('residential')
      )?.id || ''
    );
  }
  if (subType === 'flat') {
    return (
      typesList.find(
        (t) => t.name.toLowerCase().includes('flat') || t.name.toLowerCase().includes('apartment')
      )?.id || ''
    );
  }
  if (subType === 'farmhouse') {
    return typesList.find((t) => t.name.toLowerCase().includes('farm'))?.id || '';
  }
  if (subType === 'shop') {
    return (
      typesList.find(
        (t) => t.name.toLowerCase().includes('shop') || t.name.toLowerCase().includes('commercial')
      )?.id || ''
    );
  }
  if (subType === 'agriculture') {
    return typesList.find((t) => t.name.toLowerCase().includes('agri'))?.id || '';
  }
  if (subType === 'industry') {
    return typesList.find((t) => t.name.toLowerCase().includes('industr'))?.id || '';
  }
  return '';
};

export const AddProperty: React.FC = () => {
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

  // Form State
  const [sectorInput, setSectorInput] = useState('');
  const [isSectorDropdownOpen, setIsSectorDropdownOpen] = useState(false);

  // Filtered sectors for live interactive autocomplete dropdown (e.g. typing "sec" or "moh")
  const filteredSectors = useMemo(() => {
    if (!sectorInput.trim()) return sectors.slice(0, 10);
    const q = sectorInput.trim().toLowerCase();
    return sectors.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 15);
  }, [sectors, sectorInput]);

  const [location, setLocation] = useState('');
  const [houseNo, setHouseNo] = useState('');
  const [priceValue, setPriceValue] = useState('');
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('Cr');
  const [selectedCategory, setSelectedCategory] = useState<PropertyCategory>('residential');
  const [selectedSubType, setSelectedSubType] = useState<PropertySubType>('plot');
  const [otherTypeText, setOtherTypeText] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [areaSize, setAreaSize] = useState('');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('sq yard');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<PropertyStatus>('available');

  // Dimensions & Rate calculation states
  const [lengthFt, setLengthFt] = useState('');
  const [breadthFt, setBreadthFt] = useState('');
  const [rateValue, setRateValue] = useState('');
  const [rateUnit, setRateUnit] = useState<'per_gaj' | 'per_sqft' | 'per_acre'>('per_gaj');

  // Calculate total demand in rupees from rate and area
  const calculateTotalDemandFromRate = (
    rate: string,
    rUnit: 'per_gaj' | 'per_sqft' | 'per_acre',
    area: string,
    aUnit: AreaUnit
  ): number | null => {
    const numRate = parseFloat(rate);
    const numArea = parseFloat(area);
    if (!numRate || isNaN(numRate) || numRate <= 0 || !numArea || isNaN(numArea) || numArea <= 0) {
      return null;
    }

    let totalRupees = 0;
    if (rUnit === 'per_gaj') {
      if (aUnit === 'sq yard' || aUnit === 'gaj') {
        totalRupees = numArea * numRate;
      } else if (aUnit === 'sq ft') {
        totalRupees = (numArea / 9) * numRate;
      } else if (aUnit === 'acre') {
        totalRupees = numArea * 4840 * numRate;
      } else {
        totalRupees = numArea * numRate;
      }
    } else if (rUnit === 'per_sqft') {
      if (aUnit === 'sq ft') {
        totalRupees = numArea * numRate;
      } else if (aUnit === 'sq yard' || aUnit === 'gaj') {
        totalRupees = numArea * 9 * numRate;
      } else if (aUnit === 'acre') {
        totalRupees = numArea * 43560 * numRate;
      } else {
        totalRupees = numArea * numRate;
      }
    } else if (rUnit === 'per_acre') {
      if (aUnit === 'acre') {
        totalRupees = numArea * numRate;
      } else if (aUnit === 'sq yard' || aUnit === 'gaj') {
        totalRupees = (numArea / 4840) * numRate;
      } else {
        totalRupees = numArea * numRate;
      }
    }

    return Math.round(totalRupees);
  };

  // When dimensions (L x B) change, update area size and total demand
  const handleDimensionsUpdate = (l: string, b: string, currentUnit: AreaUnit) => {
    const numL = parseFloat(l);
    const numB = parseFloat(b);
    if (numL > 0 && numB > 0) {
      const totalSqFt = numL * numB;
      let computedArea = 0;
      if (currentUnit === 'sq yard' || currentUnit === 'gaj') {
        computedArea = Math.round((totalSqFt / 9) * 100) / 100;
      } else if (currentUnit === 'sq ft') {
        computedArea = Math.round(totalSqFt * 100) / 100;
      } else {
        computedArea = Math.round((totalSqFt / 9) * 100) / 100;
      }
      const areaStr = String(computedArea);
      setAreaSize(areaStr);

      if (rateValue.trim()) {
        const totalRupees = calculateTotalDemandFromRate(rateValue, rateUnit, areaStr, currentUnit);
        if (totalRupees && totalRupees > 0) {
          const { val: pVal, unit: pUnit } = priceToDisplayVal(totalRupees);
          setPriceValue(pVal);
          setPriceUnit(pUnit);
        }
      }
    }
  };

  // When user changes rate value
  const handleRateChange = (newRate: string) => {
    setRateValue(newRate);
    if (newRate.trim() && areaSize.trim()) {
      const totalRupees = calculateTotalDemandFromRate(newRate, rateUnit, areaSize, areaUnit);
      if (totalRupees && totalRupees > 0) {
        const { val: pVal, unit: pUnit } = priceToDisplayVal(totalRupees);
        setPriceValue(pVal);
        setPriceUnit(pUnit);
      }
    }
  };

  // When user changes rate unit radio
  const handleRateUnitRadioChange = (newUnit: 'per_gaj' | 'per_sqft' | 'per_acre') => {
    setRateUnit(newUnit);
    if (rateValue.trim() && areaSize.trim()) {
      const totalRupees = calculateTotalDemandFromRate(rateValue, newUnit, areaSize, areaUnit);
      if (totalRupees && totalRupees > 0) {
        const { val: pVal, unit: pUnit } = priceToDisplayVal(totalRupees);
        setPriceValue(pVal);
        setPriceUnit(pUnit);
      }
    }
  };

  // When user manually updates area size
  const handleAreaSizeManualChange = (newArea: string) => {
    setAreaSize(newArea);
    if (rateValue.trim() && newArea.trim()) {
      const totalRupees = calculateTotalDemandFromRate(rateValue, rateUnit, newArea, areaUnit);
      if (totalRupees && totalRupees > 0) {
        const { val: pVal, unit: pUnit } = priceToDisplayVal(totalRupees);
        setPriceValue(pVal);
        setPriceUnit(pUnit);
      }
    }
  };

  // When user changes area unit dropdown
  const handleAreaUnitChange = (newUnit: AreaUnit) => {
    setAreaUnit(newUnit);
    if (lengthFt && breadthFt) {
      handleDimensionsUpdate(lengthFt, breadthFt, newUnit);
    } else if (rateValue.trim() && areaSize.trim()) {
      const totalRupees = calculateTotalDemandFromRate(rateValue, rateUnit, areaSize, newUnit);
      if (totalRupees && totalRupees > 0) {
        const { val: pVal, unit: pUnit } = priceToDisplayVal(totalRupees);
        setPriceValue(pVal);
        setPriceUnit(pUnit);
      }
    }
  };



  // Category switch handler
  const handleCategoryChange = (category: PropertyCategory) => {
    setSelectedCategory(category);
    if (selectedSubType === 'other') {
      return;
    }
    if (category === 'residential') {
      if (selectedSubType === 'shop' || selectedSubType === 'agriculture' || selectedSubType === 'industry') {
        setSelectedSubType('home');
        const tid = getTypeIdForSubType('home', propertyTypes);
        if (tid) setSelectedTypeId(tid);
      } else {
        const tid = getTypeIdForSubType(selectedSubType, propertyTypes);
        if (tid) setSelectedTypeId(tid);
      }
    } else {
      if (selectedSubType === 'home' || selectedSubType === 'flat' || selectedSubType === 'farmhouse') {
        setSelectedSubType('shop');
        const tid = getTypeIdForSubType('shop', propertyTypes);
        if (tid) setSelectedTypeId(tid);
      } else {
        const tid = getTypeIdForSubType(selectedSubType, propertyTypes);
        if (tid) setSelectedTypeId(tid);
      }
    }
  };

  // Sub-type radio switch handler
  const handleSubTypeChange = (subType: PropertySubType) => {
    setSelectedSubType(subType);
    if (subType === 'other') {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.type;
        return next;
      });
    } else {
      const tid = getTypeIdForSubType(subType, propertyTypes);
      if (tid) setSelectedTypeId(tid);
      setErrors((prev) => {
        const next = { ...prev };
        delete next.type;
        delete next.otherType;
        return next;
      });
    }
  };

  // Phone duplicate warning state
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicatePhoneMatch[]>([]);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Editing state
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);

  // Fetch reference lists (sectors & property types)
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
          const defaultPlot = typeData.find((t) => t.name.toLowerCase().includes('plot')) || typeData[0];
          setSelectedTypeId(defaultPlot.id);
        }
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
    setSectorInput('');
    setLocation('');
    setHouseNo('');
    setPriceValue('');
    setPriceUnit('Cr');
    setSelectedCategory('residential');
    setSelectedSubType('plot');
    setOtherTypeText('');
    const defaultPlot = propertyTypes.find((t) => t.name.toLowerCase().includes('plot')) || propertyTypes[0];
    if (defaultPlot) setSelectedTypeId(defaultPlot.id);
    setAreaSize('');
    setAreaUnit('sq yard');
    setOwnerName('');
    setOwnerPhone('');
    setDetails('');
    setStatus('available');
    setLengthFt('');
    setBreadthFt('');
    setRateValue('');
    setRateUnit('per_gaj');
    setDuplicateMatches([]);
    setErrors({});
    setEditingPropertyId(null);
  };

  // Validate form
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!sectorInput.trim()) {
      newErrors.sector = 'Sector / Colony is required';
    }

    const parsedPrice = parsePriceInput(priceValue, priceUnit);
    if (!parsedPrice || parsedPrice <= 0) {
      newErrors.price = 'Enter a valid positive price (max 2 decimals)';
    }

    if (selectedSubType === 'other') {
      if (!otherTypeText.trim()) {
        newErrors.otherType = 'Please fill the other property type';
      }
    } else {
      const tid = selectedTypeId || getTypeIdForSubType(selectedSubType, propertyTypes);
      if (!tid) {
        newErrors.type = 'Please select a property type';
      }
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
      let finalSectorId = '';
      const cleanSectorName = sectorInput.trim();

      // Check if sector already exists (case-insensitive)
      const existing = sectors.find((s) => s.name.trim().toLowerCase() === cleanSectorName.toLowerCase());
      if (existing) {
        finalSectorId = existing.id;
      } else {
        // Fast auto-create new sector without prompting or mode switching
        if (!isSupabaseConfigured) {
          const newSec: Sector = {
            id: 'sec-' + Date.now(),
            name: cleanSectorName,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_deleted: false,
          };
          setSectors((prev) => [...prev, newSec]);
          finalSectorId = newSec.id;
        } else {
          const { data: newSecData, error: secError } = await supabase
            .from('sectors')
            .insert({ name: cleanSectorName })
            .select('id, name')
            .single();

          if (secError) {
            throw new Error(`Failed to create sector: ${secError.message}`);
          }
          finalSectorId = newSecData.id;
          await loadData();
        }
      }

      const parsedPrice = parsePriceInput(priceValue, priceUnit)!;
      const cleanPhone = normalizePhone(ownerPhone).raw;

      // Build metadata prefix for dimensions and rate if entered
      const metaParts: string[] = [];
      if (lengthFt.trim() && breadthFt.trim()) {
        metaParts.push(`Dim: ${lengthFt.trim()}x${breadthFt.trim()} ft`);
      }
      if (rateValue.trim()) {
        const rateLabel = rateUnit === 'per_gaj' ? 'gaj' : rateUnit === 'per_sqft' ? 'sqft' : 'acre';
        metaParts.push(`Rate: ₹${Number(rateValue.trim()).toLocaleString('en-IN')}/${rateLabel}`);
      }
      const metaPrefix = metaParts.length > 0 ? `[${metaParts.join(' | ')}]` : '';
      const finalDetails = metaPrefix
        ? details.trim()
          ? `${metaPrefix} ${details.trim()}`
          : metaPrefix
        : details.trim() || null;

      // Resolve final type ID (supporting dynamic 'other' custom type)
      let finalTypeId = selectedTypeId;
      if (selectedSubType === 'other') {
        const cleanTypeName = otherTypeText.trim();
        const existingType = propertyTypes.find(
          (t) => t.name.trim().toLowerCase() === cleanTypeName.toLowerCase()
        );
        if (existingType) {
          finalTypeId = existingType.id;
        } else {
          if (!isSupabaseConfigured) {
            const newType: PropertyType = {
              id: 'type-' + Date.now(),
              name: cleanTypeName,
              sort_order: propertyTypes.length + 1,
            };
            setPropertyTypes((prev) => [...prev, newType]);
            finalTypeId = newType.id;
          } else {
            const { data: newTypeData, error: typeCreateError } = await supabase
              .from('property_types')
              .insert({ name: cleanTypeName, sort_order: propertyTypes.length + 1 })
              .select('id, name, sort_order')
              .single();

            if (typeCreateError) {
              throw new Error(`Failed to create property type: ${typeCreateError.message}`);
            }
            if (newTypeData) {
              setPropertyTypes((prev) => [...prev, newTypeData]);
              finalTypeId = newTypeData.id;
            }
          }
        }
      } else {
        if (!finalTypeId) {
          finalTypeId = getTypeIdForSubType(selectedSubType, propertyTypes);
        }
      }

      if (!finalTypeId) {
        throw new Error('Please select a valid property type');
      }

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
                  type_id: finalTypeId,
                  type_name: propertyTypes.find((t) => t.id === finalTypeId)?.name || otherTypeText.trim(),
                  area_size: areaSize ? Number(areaSize) : null,
                  area_unit: areaUnit,
                  details: finalDetails,
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
          const newPlotId = `JSK-${String(nextPlotNo).padStart(4, '0')}`;
          const newProp = {
            id: 'mock-prop-' + Date.now(),
            plot_no: nextPlotNo,
            plot_id: newPlotId,
            sector_id: finalSectorId,
            sector_name: sectors.find((s) => s.id === finalSectorId)?.name,
            location: location.trim(),
            house_no: houseNo.trim() || null,
            price: parsedPrice,
            type_id: finalTypeId,
            type_name: propertyTypes.find((t) => t.id === finalTypeId)?.name || otherTypeText.trim(),
            area_size: areaSize ? Number(areaSize) : null,
            area_unit: areaUnit,
            details: finalDetails,
            status,
            created_at: new Date().toISOString(),
            _mockContactName: ownerName.trim() || null,
            _mockPhone: cleanPhone,
          };
          localStorage.setItem('re_mock_properties', JSON.stringify([newProp, ...savedList]));
          showToast({
            type: 'success',
            title: `Property Saved!`,
            message: `New Property ID: ${formatPropertyId(newPlotId)} registered successfully.`,
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
          p_type_id: finalTypeId,
          p_area_size: areaSize ? Number(areaSize) : null,
          p_area_unit: areaUnit || null,
          p_details: finalDetails,
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
          p_type_id: finalTypeId,
          p_area_size: areaSize ? Number(areaSize) : null,
          p_area_unit: areaUnit || null,
          p_details: finalDetails,
          p_status: status,
          p_contact_name: ownerName.trim() || null,
          p_phone: cleanPhone,
        });

        if (createError) throw createError;

        const rawPlotId = data?.[0]?.plot_id || 'JSK-0000';
        const assignedId = formatPropertyId(rawPlotId);
        showToast({
          type: 'success',
          title: `Property ID: ${assignedId}`,
          message: `Saved successfully! Assigned ${assignedId}`,
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

      {/* Main Form Card - Compact Layout */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200 dark:border-slate-800 shadow-xl">
        <form onSubmit={handleSave} className="space-y-4">
          {/* Line 1: Property Category & Type Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>Property Category & Type</span>
                <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">1-click select</span>
            </div>

            {/* Step 1: Top 2 Options (Residential vs Commercial) */}
            <div className="grid grid-cols-2 gap-3">
              {/* Option 1: Residential */}
              <button
                type="button"
                id="category-residential-btn"
                onClick={() => handleCategoryChange('residential')}
                className={`group relative flex items-center gap-3 p-3 sm:p-3.5 rounded-2xl border transition-all text-left ${
                  selectedCategory === 'residential'
                    ? 'border-brand-600 bg-gradient-to-r from-brand-50/90 to-brand-100/50 dark:from-brand-950/80 dark:to-brand-900/40 text-brand-950 dark:text-brand-100 ring-2 ring-brand-500/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100/70 dark:hover:bg-slate-800/80'
                }`}
              >
                <div
                  className={`p-2 rounded-xl transition-colors shrink-0 ${
                    selectedCategory === 'residential'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:text-brand-600 dark:group-hover:text-brand-400'
                  }`}
                >
                  <Home className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-bold tracking-tight">Residential</span>
                    {selectedCategory === 'residential' && (
                      <span className="w-2 h-2 rounded-full bg-brand-600 dark:bg-brand-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    Plot, Home, Flat & more
                  </p>
                </div>
              </button>

              {/* Option 2: Commercial */}
              <button
                type="button"
                id="category-commercial-btn"
                onClick={() => handleCategoryChange('commercial')}
                className={`group relative flex items-center gap-3 p-3 sm:p-3.5 rounded-2xl border transition-all text-left ${
                  selectedCategory === 'commercial'
                    ? 'border-brand-600 bg-gradient-to-r from-brand-50/90 to-brand-100/50 dark:from-brand-950/80 dark:to-brand-900/40 text-brand-950 dark:text-brand-100 ring-2 ring-brand-500/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100/70 dark:hover:bg-slate-800/80'
                }`}
              >
                <div
                  className={`p-2 rounded-xl transition-colors shrink-0 ${
                    selectedCategory === 'commercial'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:text-brand-600 dark:group-hover:text-brand-400'
                  }`}
                >
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-bold tracking-tight">Commercial</span>
                    {selectedCategory === 'commercial' && (
                      <span className="w-2 h-2 rounded-full bg-brand-600 dark:bg-brand-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    Plot, Shop, Agri, Industry
                  </p>
                </div>
              </button>
            </div>

            {/* Step 2: Dynamic Radio Buttons for the selected category */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Select {selectedCategory === 'residential' ? 'Residential' : 'Commercial'} Type:
                </span>
                <span className="text-[11px] text-slate-400">
                  {(selectedCategory === 'residential' ? residentialOptions : commercialOptions).length} options
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {(selectedCategory === 'residential' ? residentialOptions : commercialOptions).map((opt) => {
                  const isSelected = selectedSubType === opt.id;
                  return (
                    <label
                      key={opt.id}
                      className={`flex-1 min-w-fit flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl border text-xs sm:text-sm font-medium cursor-pointer transition-all select-none text-center ${
                        isSelected
                          ? 'border-brand-600 bg-brand-50/90 text-brand-700 dark:bg-brand-950/70 dark:border-brand-500 dark:text-brand-200 shadow-sm font-semibold ring-1 ring-brand-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="propertySubTypeRadio"
                        value={opt.id}
                        checked={isSelected}
                        onChange={() => handleSubTypeChange(opt.id)}
                        className="w-3.5 h-3.5 text-brand-600 focus:ring-brand-500 border-slate-300 dark:border-slate-600 cursor-pointer shrink-0"
                      />
                      <span className="whitespace-nowrap">{opt.label}</span>
                    </label>
                  );
                })}
              </div>

              {/* Step 3: "Other" Input field when other is selected */}
              {selectedSubType === 'other' && (
                <div className="pt-1.5">
                  <input
                    type="text"
                    id="other-type-input"
                    placeholder="Fill other type"
                    value={otherTypeText}
                    onChange={(e) => {
                      setOtherTypeText(e.target.value);
                      if (errors.otherType) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.otherType;
                          return next;
                        });
                      }
                    }}
                    autoFocus
                    className="w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border border-brand-300 dark:border-brand-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white placeholder-slate-400 font-medium shadow-inner"
                  />
                  {errors.otherType && (
                    <p className="text-xs text-rose-500 mt-1 font-medium">{errors.otherType}</p>
                  )}
                </div>
              )}
            </div>

            {errors.type && <p className="text-xs text-rose-500 mt-1">{errors.type}</p>}
          </div>

          {/* Line 2: Dimensions (Left) & Total Area & Unit (Right) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Dimensions (Length × Breadth) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                  <span>Dimensions (Length × Breadth)</span>
                </label>
                {lengthFt && breadthFt ? (
                  <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 font-mono">
                    {lengthFt}×{breadthFt} ft ({Number(lengthFt) * Number(breadthFt)} sq ft)
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">Optional</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  placeholder="Length (ft)"
                  title="Length in feet"
                  value={lengthFt}
                  onChange={(e) => {
                    setLengthFt(e.target.value);
                    handleDimensionsUpdate(e.target.value, breadthFt, areaUnit);
                  }}
                  className="w-full py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Breadth (ft)"
                  title="Breadth in feet"
                  value={breadthFt}
                  onChange={(e) => {
                    setBreadthFt(e.target.value);
                    handleDimensionsUpdate(lengthFt, e.target.value, areaUnit);
                  }}
                  className="w-full py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                />
              </div>
            </div>

            {/* Right: Total Area & Unit */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Total Area & Unit
                </label>
                <span className="text-[11px] text-slate-400">Auto or direct entry</span>
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  placeholder="Total Area"
                  title="Total Area Size"
                  value={areaSize}
                  onChange={(e) => handleAreaSizeManualChange(e.target.value)}
                  className="flex-1 py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                />
                <select
                  value={areaUnit}
                  onChange={(e) => handleAreaUnitChange(e.target.value as AreaUnit)}
                  className="w-36 sm:w-44 py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                >
                  <option value="sq yard">Gaj (Sq. Yd)</option>
                  <option value="sq ft">Sq. Ft</option>
                  <option value="acre">Acre</option>
                  <option value="marla">Marla</option>
                  <option value="kanal">Kanal</option>
                </select>
              </div>
            </div>
          </div>

          {/* Line 3: Sector / Colony (Left) & Location / Address (Right) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Sector / Colony (Fast Direct Input with Datalist Suggestions) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Sector / Colony <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400">Type or pick from list</span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Sector 7, Sector 14, or Mohan Nagar"
                  value={sectorInput}
                  onFocus={() => setIsSectorDropdownOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setIsSectorDropdownOpen(false), 200);
                  }}
                  onChange={(e) => {
                    setSectorInput(e.target.value);
                    setIsSectorDropdownOpen(true);
                  }}
                  className={`w-full py-2.5 px-3 pr-9 bg-slate-50 dark:bg-slate-800 border rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white font-medium ${
                    errors.sector ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                  }`}
                />
                {sectorInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSectorInput('');
                      setIsSectorDropdownOpen(false);
                    }}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Clear sector"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* Instant Suggestion Dropdown as user types "sec", "moh", etc. */}
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
                        }}
                        className="w-full px-3.5 py-2 text-left text-xs sm:text-sm hover:bg-brand-50 dark:hover:bg-slate-800/80 flex items-center justify-between transition-colors group cursor-pointer"
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
              {errors.sector && <p className="text-xs text-rose-500 mt-1">{errors.sector}</p>}
            </div>

            {/* Right: Location / Address */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Location / Address <span className="text-slate-400 font-normal lowercase text-[11px]">(optional)</span>
                </label>
                <span className="text-[11px] text-slate-400">Street / landmark</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Near Community Center, 60ft (Optional)"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className={`flex-1 py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white ${
                    errors.location ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                  }`}
                />
                <input
                  type="text"
                  placeholder="House/Plot No (Opt)"
                  title="Owner's Private House/Plot No"
                  value={houseNo}
                  onChange={(e) => setHouseNo(e.target.value)}
                  className="w-36 py-2.5 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                />
              </div>
              {errors.location && <p className="text-xs text-rose-500 mt-1">{errors.location}</p>}
            </div>
          </div>

          {/* Line 4: Price Rate per Unit with Dropdown Selection (Like Upper Form) */}
          <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-1.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Rate / Price Per Unit <span className="text-slate-400 font-normal">(Optional for Plots / Land)</span>
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Leave blank for building, flat, or lump-sum property.
              </p>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 50000 or 3500 (leave blank for building)"
                  value={rateValue}
                  onChange={(e) => handleRateChange(e.target.value)}
                  className="w-full py-2.5 px-3 pl-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white font-medium"
                />
              </div>

              {/* Dropdown Selection for Rate Unit */}
              <select
                value={rateUnit}
                onChange={(e) => handleRateUnitRadioChange(e.target.value as 'per_gaj' | 'per_sqft' | 'per_acre')}
                className="w-40 sm:w-48 py-2.5 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
              >
                <option value="per_gaj">Per Gaj (Sq. Yard)</option>
                <option value="per_sqft">Per Sq. Ft</option>
                <option value="per_acre">Per Acre</option>
              </select>
            </div>
          </div>

          {/* Line 5: Total Demand Field */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                <span>Total Demand (Price) <span className="text-rose-500">*</span></span>
              </label>
              {rateValue && areaSize ? (
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  ✓ Auto-multiplied ({areaSize} {areaUnit} × ₹{Number(rateValue).toLocaleString('en-IN')})
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Direct lump-sum demand (Building / House / Flat)
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="e.g. 4 or 85 or 1.25"
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
                className={`flex-1 py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white font-bold ${
                  errors.price ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                }`}
              />
              <select
                value={priceUnit}
                onChange={(e) => setPriceUnit(e.target.value as PriceUnit)}
                className="w-28 py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
              >
                <option value="Cr">Crore (Cr)</option>
                <option value="Lakh">Lakh</option>
              </select>
            </div>

            {/* Live Indian Notation Preview */}
            {priceValue && (
              <div className="text-xs font-medium text-brand-600 dark:text-brand-400 flex items-center gap-1.5 pt-0.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{getPricePreview(priceValue, priceUnit) || 'Invalid price entered'}</span>
              </div>
            )}
            {errors.price && <p className="text-xs text-rose-500 mt-1">{errors.price}</p>}
          </div>

          {/* Line 6: Owner Phone (Left) & Owner Name (Right) */}
          <div className="p-3.5 rounded-2xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Owner Contact Details (Confidential)
              </span>
              <span className="text-[11px] text-amber-700 dark:text-amber-400">
                Protected
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Left: Phone No Field */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Owner Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="10-digit mobile (e.g. 9876543210)"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  className={`w-full py-2.5 px-3 bg-white dark:bg-slate-900 border rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white font-mono ${
                    errors.phone ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                  }`}
                />
                {errors.phone && <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>}
                {isCheckingPhone && (
                  <p className="text-[11px] text-slate-400 mt-1">Checking existing inventory...</p>
                )}
              </div>

              {/* Right: Optional Name Field */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Owner / Seller Name <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full py-2.5 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                />
              </div>
            </div>

            {/* Duplicate Phone Warning Box */}
            {duplicateMatches.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-100/90 dark:bg-amber-900/50 border border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-100 flex items-start gap-2 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold">Duplicate Phone:</span> Linked to existing listing(s):
                  <div className="mt-1 flex flex-wrap gap-1">
                    {duplicateMatches.map((m, idx) => (
                      <span key={idx} className="font-mono font-semibold px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-700 text-[11px]">
                        {formatPropertyId(m.plot_id)}{m.location ? ` (${m.location})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Line 7: General Details / Notes Textarea */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              General Details / Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. East facing, 24m road, registry done, boundary wall constructed..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors min-h-[44px]"
            >
              Reset Form
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl font-semibold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 shadow-md shadow-brand-500/25 disabled:opacity-50 flex items-center justify-center gap-2 transition-all min-h-[44px] text-xs sm:text-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{editingPropertyId ? 'Update Property' : 'Save Property'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
