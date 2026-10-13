import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building,
  Building2,
  Home,
  Loader2,
  Sparkles,
  Calculator,
  Compass,
  MapPin,
  X,
  Pencil,
  Copy,
  Check,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { parsePriceInput, getPricePreview, formatPrice, type PriceUnit } from '../lib/price';
import { normalizePhone } from '../lib/phone';
import {
  formatPropertyId,
  formatPropertiesText,
  extractRate,
  extractDimensions,
  extractCleanDetails,
} from '../lib/propertyFormat';
import { getCachedReferenceData, invalidateReferenceCache } from '../lib/referenceCache';
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

// Session Added Properties: displayed under the form with Edit button until page is refreshed
export interface SessionAddedProperty {
  id: string;
  plot_id: string;
  sector_name: string;
  location?: string;
  house_no?: string;
  price: number;
  type_id?: string;
  type_name: string;
  area_size?: number | null;
  area_unit?: string | null;
  details?: string | null;
  status: string;
  is_broker: boolean;
  contact_name?: string | null;
  phone?: string | null;
  length_ft?: string;
  breadth_ft?: string;
  rate_value?: string;
  rate_unit?: string;
  added_at: string;
}

// Build composite category - subType name (e.g. "Residential - Plot", "Commercial - Shop")
export function buildCompositeTypeName(
  category: PropertyCategory,
  subType: PropertySubType,
  customOtherText?: string
): string {
  const catPrefix = category === 'residential' ? 'Residential' : 'Commercial';
  if (subType === 'other') {
    const custom = (customOtherText || '').trim();
    return custom ? `${catPrefix} - ${custom}` : `${catPrefix} - Other`;
  }
  if (subType === 'plot') {
    return `${catPrefix} - Plot`;
  }
  if (subType === 'home') {
    return 'Residential - House/Kothi';
  }
  if (subType === 'flat') {
    return 'Residential - Flat / Apartment';
  }
  if (subType === 'farmhouse') {
    return 'Residential - Farmhouse';
  }
  if (subType === 'shop') {
    return 'Commercial - Shop';
  }
  if (subType === 'agriculture') {
    return 'Commercial - Agricultural Land';
  }
  if (subType === 'industry') {
    return 'Commercial - Industrial';
  }
  return `${catPrefix} - ${subType}`;
}

// Helper to match built-in subType to an existing PropertyType from database/mock
export const getTypeIdForSubType = (
  subType: PropertySubType,
  typesList: PropertyType[],
  category: PropertyCategory = 'residential'
): string => {
  const compositeName = buildCompositeTypeName(category, subType).toLowerCase();
  const exact = typesList.find((t) => t.name.toLowerCase() === compositeName);
  if (exact) return exact.id;

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

  // Search params for edit support
  const [searchParams, setSearchParams] = useSearchParams();

  // Editing state
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);

  // Broker flag (Owner vs Broker)
  const [isBroker, setIsBroker] = useState(false);

  const [sessionAddedProperties, setSessionAddedProperties] = useState<SessionAddedProperty[]>([]);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);

  const populateFormForEdit = (data: any) => {
    setEditingPropertyId(data.id);
    setSectorInput(data.sector_name || data.locality_name || '');
    setLocation(data.location || data.landmark || '');
    setHouseNo(data.house_no || '');
    setSelectedTypeId(data.type_id || '');
    setStatus(data.status || 'available');
    setOwnerPhone(data.phone || data._mockPhone || '');
    setOwnerName(data.contact_name || data._mockContactName || '');

    // Broker flag check
    const broker = Boolean(data.is_broker || (data.details && /\[Broker\]/i.test(data.details)));
    setIsBroker(broker);

    // Parse price to unit
    if (data.price) {
      if (data.price >= 10000000) {
        setPriceValue(String(data.price / 10000000));
        setPriceUnit('Cr');
      } else {
        setPriceValue(String(data.price / 100000));
        setPriceUnit('Lakh');
      }
    }

    if (data.area_size) {
      setAreaSize(String(data.area_size));
    }
    if (data.area_unit) {
      setAreaUnit(data.area_unit as AreaUnit);
    }

    // Direct length/breadth/rate if present in data object
    if (data.length_ft) setLengthFt(String(data.length_ft));
    if (data.breadth_ft) setBreadthFt(String(data.breadth_ft));
    if (data.rate_value) setRateValue(String(data.rate_value));
    if (data.rate_unit) setRateUnit(data.rate_unit);

    // Extract length/breadth if present in details
    const rawDetails = data.details || '';
    const dimMatch = rawDetails.match(/(?:Length:\s*(\d+(?:\.\d+)?)\s*ft,\s*Breadth:\s*(\d+(?:\.\d+)?)\s*ft)|(?:Dim:\s*(\d+(?:\.\d+)?)\s*[x*×]\s*(\d+(?:\.\d+)?))/i);
    if (dimMatch && !data.length_ft) {
      const l = dimMatch[1] || dimMatch[3];
      const b = dimMatch[2] || dimMatch[4];
      setLengthFt(l);
      setBreadthFt(b);
    }

    // Extract rate if present in details
    const rateMatch = rawDetails.match(/Rate:\s*₹?([0-9,]+(?:\.[0-9]+)?)\/(gaj|sqft|acre)/i);
    if (rateMatch && !data.rate_value) {
      setRateValue(rateMatch[1].replace(/,/g, ''));
      if (rateMatch[2].toLowerCase() === 'gaj') setRateUnit('per_gaj');
      else if (rateMatch[2].toLowerCase() === 'sqft') setRateUnit('per_sqft');
      else if (rateMatch[2].toLowerCase() === 'acre') setRateUnit('per_acre');
    }

    // Match Category and SubType
    const typeName = (data.type_name || '').toLowerCase();
    if (typeName.includes('commercial')) {
      setSelectedCategory('commercial');
      if (typeName.includes('shop')) setSelectedSubType('shop');
      else if (typeName.includes('agri')) setSelectedSubType('agriculture');
      else if (typeName.includes('industr')) setSelectedSubType('industry');
      else if (typeName.includes('plot')) setSelectedSubType('plot');
      else {
        setSelectedSubType('other');
        setOtherTypeText(data.type_name || '');
      }
    } else if (typeName) {
      setSelectedCategory('residential');
      if (typeName.includes('plot')) setSelectedSubType('plot');
      else if (typeName.includes('house') || typeName.includes('kothi') || typeName.includes('home')) setSelectedSubType('home');
      else if (typeName.includes('flat') || typeName.includes('apartment')) setSelectedSubType('flat');
      else if (typeName.includes('farm')) setSelectedSubType('farmhouse');
      else {
        setSelectedSubType('other');
        setOtherTypeText(data.type_name || '');
      }
    }

    // Clean details for notes textarea
    const cleaned = rawDetails
      .replace(/\[Broker\]\s*/gi, '')
      .replace(/\[?Length:\s*[\d.]+\s*ft,\s*Breadth:\s*[\d.]+\s*ft(?:\s*\|\s*)?/gi, '')
      .replace(/\[?Dim:\s*[\d.]+\s*[x*×]\s*[\d.]+(?:\s*ft)?(?:\s*\|\s*)?/gi, '')
      .replace(/Rate:\s*₹[\d,]+\/(?:gaj|sqft|acre)(?:\s*\|\s*)?/gi, '')
      .replace(/[[\]]/g, '')
      .trim();
    setDetails(cleaned);
  };

  const handleEditSessionProperty = (prop: SessionAddedProperty) => {
    populateFormForEdit({
      ...prop,
      type_id: prop.type_id || getTypeIdForSubType(selectedSubType, propertyTypes, selectedCategory),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast({
      type: 'info',
      title: `Editing ${formatPropertyId(prop.plot_id)}`,
      message: 'Property details loaded. Update the fields above and click Update Property.',
    });
  };

  const handleCopySessionProperty = async (prop: SessionAddedProperty) => {
    const text = formatPropertiesText([
      {
        plot_id: prop.plot_id,
        price: prop.price,
        type_name: prop.type_name,
        sector_name: prop.sector_name,
        locality_name: prop.sector_name,
        location: prop.location,
        landmark: prop.location,
        house_no: prop.house_no,
        area_size: prop.area_size,
        area_unit: prop.area_unit,
        status: prop.status,
        details: prop.details,
        phone: prop.phone,
        is_broker: prop.is_broker,
      },
    ]);

    try {
      await navigator.clipboard.writeText(text);
      setCopiedSessionId(prop.id);
      showToast({
        type: 'success',
        title: 'Copied!',
        message: `${formatPropertyId(prop.plot_id)} copied to clipboard`,
      });
      setTimeout(() => setCopiedSessionId(null), 2500);
    } catch {
      showToast({ type: 'error', title: 'Copy Failed', message: 'Could not access clipboard' });
    }
  };

  const loadPropertyForEdit = async (propId: string) => {
    try {
      if (!isSupabaseConfigured) {
        const all: any[] = JSON.parse(localStorage.getItem('re_mock_properties') || '[]');
        const found = all.find((p: any) => p.id === propId);
        if (found) {
          populateFormForEdit(found);
        }
        return;
      }

      const { data, error } = await supabase.rpc('get_property_for_edit', { p_id: propId });
      if (error) throw error;
      if (data && data[0]) {
        populateFormForEdit(data[0]);
      }
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Edit Load Failed',
        message: err.message || 'Could not load property details for editing',
      });
    }
  };

  // Fetch reference lists (sectors & property types)
  const loadData = async (forceRefresh = false) => {
    try {
      const { sectors: secData, propertyTypes: typeData } = await getCachedReferenceData(forceRefresh);
      setSectors(secData);
      setPropertyTypes(typeData);
      if (typeData.length > 0 && !selectedTypeId) {
        const defaultPlot = typeData.find((t) => t.name.toLowerCase().includes('plot')) || typeData[0];
        setSelectedTypeId(defaultPlot.id);
      }
    } catch {
      showToast({ type: 'error', title: 'Network Error', message: 'Failed to load reference data' });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Listen to URL edit param
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId) {
      loadPropertyForEdit(editId);
    }
  }, [searchParams]);

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
    setIsBroker(false);
    setDetails('');
    setStatus('available');
    setLengthFt('');
    setBreadthFt('');
    setRateValue('');
    setRateUnit('per_gaj');
    setDuplicateMatches([]);
    setErrors({});
    setEditingPropertyId(null);
    setSearchParams({});
  };

  // Validate form
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!sectorInput.trim()) {
      newErrors.sector = 'Locality is required';
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
      const tid = selectedTypeId || getTypeIdForSubType(selectedSubType, propertyTypes, selectedCategory);
      if (!tid) {
        newErrors.type = 'Please select a property type';
      }
    }

    // Phone is optional for both owner and broker
    if (ownerPhone.trim()) {
      const normPhone = normalizePhone(ownerPhone);
      if (!normPhone.isValid) {
        newErrors.phone = normPhone.error || 'Valid 10-digit Indian phone number required';
      }
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
            throw new Error(`Failed to create locality: ${secError.message}`);
          }
          finalSectorId = newSecData.id;
          invalidateReferenceCache();
          await loadData(true);
        }
      }

      const parsedPrice = parsePriceInput(priceValue, priceUnit)!;
      const cleanPhone = ownerPhone.trim() ? normalizePhone(ownerPhone).raw : null;

      // Build metadata prefix for dimensions, rate, and broker if entered
      const metaParts: string[] = [];
      if (lengthFt.trim() && breadthFt.trim()) {
        metaParts.push(`Length: ${lengthFt.trim()} ft, Breadth: ${breadthFt.trim()} ft`);
      }
      if (rateValue.trim()) {
        const rateLabel = rateUnit === 'per_gaj' ? 'gaj' : rateUnit === 'per_sqft' ? 'sqft' : 'acre';
        metaParts.push(`Rate: ₹${Number(rateValue.trim()).toLocaleString('en-IN')}/${rateLabel}`);
      }
      if (isBroker) {
        metaParts.push('[Broker]');
      }
      const metaPrefix = metaParts.length > 0 ? `[${metaParts.join(' | ')}]` : '';
      const finalDetails = metaPrefix
        ? details.trim()
          ? `${metaPrefix} ${details.trim()}`
          : metaPrefix
        : details.trim() || null;

      // Resolve final type ID with composite name (e.g. "Residential - Plot", "Commercial - Shop")
      const targetTypeName = buildCompositeTypeName(selectedCategory, selectedSubType, otherTypeText);
      let finalTypeId = selectedTypeId;

      const existingType = propertyTypes.find(
        (t) => t.name.trim().toLowerCase() === targetTypeName.toLowerCase()
      );
      if (existingType) {
        finalTypeId = existingType.id;
      } else {
        if (!isSupabaseConfigured) {
          const newType: PropertyType = {
            id: 'type-' + Date.now(),
            name: targetTypeName,
            sort_order: propertyTypes.length + 1,
          };
          setPropertyTypes((prev) => [...prev, newType]);
          finalTypeId = newType.id;
        } else {
          try {
            const { data: newTypeData, error: typeCreateError } = await supabase
              .from('property_types')
              .insert({ name: targetTypeName, sort_order: propertyTypes.length + 1 })
              .select('id, name, sort_order')
              .single();

            if (!typeCreateError && newTypeData) {
              setPropertyTypes((prev) => [...prev, newTypeData]);
              finalTypeId = newTypeData.id;
            }
          } catch {
            // fallback
          }
          if (!finalTypeId) {
            finalTypeId = getTypeIdForSubType(selectedSubType, propertyTypes, selectedCategory);
          }
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
                  locality_name: sectors.find((s) => s.id === finalSectorId)?.name,
                  location: location.trim(),
                  landmark: location.trim(),
                  house_no: houseNo.trim() || null,
                  price: parsedPrice,
                  type_id: finalTypeId,
                  type_name: targetTypeName,
                  area_size: areaSize ? Number(areaSize) : null,
                  area_unit: areaUnit,
                  details: finalDetails,
                  status,
                  is_broker: isBroker,
                  _mockContactName: ownerName.trim() || null,
                  _mockPhone: cleanPhone,
                }
              : p
          );
          localStorage.setItem('re_mock_properties', JSON.stringify(updated));
          showToast({ type: 'success', title: 'Property Updated', message: 'Details updated successfully' });
          setSessionAddedProperties((prev) =>
            prev.map((item) =>
              item.id === editingPropertyId
                ? {
                    ...item,
                    sector_name: cleanSectorName,
                    location: location.trim() || undefined,
                    house_no: houseNo.trim() || undefined,
                    price: parsedPrice,
                    type_id: finalTypeId,
                    type_name: targetTypeName,
                    area_size: areaSize ? Number(areaSize) : null,
                    area_unit: areaUnit,
                    details: finalDetails,
                    status,
                    is_broker: isBroker,
                    contact_name: ownerName.trim() || undefined,
                    phone: cleanPhone || undefined,
                    length_ft: lengthFt.trim() || undefined,
                    breadth_ft: breadthFt.trim() || undefined,
                    rate_value: rateValue.trim() || undefined,
                    rate_unit: rateUnit || undefined,
                  }
                : item
            )
          );
        } else {
          // Strictly sequential and unique plot number
          const maxPlotNo = savedList.reduce((max: number, p: any) => Math.max(max, Number(p.plot_no) || 0), 0);
          const nextPlotNo = maxPlotNo + 1;
          const newPlotId = `JSK-${String(nextPlotNo).padStart(4, '0')}`;
          const newProp = {
            id: 'mock-prop-' + Date.now(),
            plot_no: nextPlotNo,
            plot_id: newPlotId,
            sector_id: finalSectorId,
            sector_name: sectors.find((s) => s.id === finalSectorId)?.name,
            locality_name: sectors.find((s) => s.id === finalSectorId)?.name,
            location: location.trim(),
            landmark: location.trim(),
            house_no: houseNo.trim() || null,
            price: parsedPrice,
            type_id: finalTypeId,
            type_name: targetTypeName,
            area_size: areaSize ? Number(areaSize) : null,
            area_unit: areaUnit,
            details: finalDetails,
            status,
            is_broker: isBroker,
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

          const newSessionItem: SessionAddedProperty = {
            id: newProp.id,
            plot_id: formatPropertyId(newPlotId),
            sector_name: cleanSectorName,
            location: location.trim() || undefined,
            house_no: houseNo.trim() || undefined,
            price: parsedPrice,
            type_id: finalTypeId,
            type_name: targetTypeName,
            area_size: areaSize ? Number(areaSize) : null,
            area_unit: areaUnit,
            details: finalDetails,
            status,
            is_broker: isBroker,
            contact_name: ownerName.trim() || undefined,
            phone: cleanPhone || undefined,
            length_ft: lengthFt.trim() || undefined,
            breadth_ft: breadthFt.trim() || undefined,
            rate_value: rateValue.trim() || undefined,
            rate_unit: rateUnit || undefined,
            added_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setSessionAddedProperties((prev) => [newSessionItem, ...prev]);
        }
        resetForm();
        loadData();
        setIsSubmitting(false);
        return;
      }

      // Live Supabase RPC call
      if (editingPropertyId) {
        const updateParams: any = {
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
          p_phone: cleanPhone || '',
          p_is_broker: isBroker,
        };

        let { error: updateError } = await supabase.rpc('update_property', updateParams);
        if (updateError && (updateError.message?.includes('function') || updateError.code === 'PGRST202')) {
          delete updateParams.p_is_broker;
          const retry = await supabase.rpc('update_property', updateParams);
          if (retry.error) updateError = retry.error;
          else updateError = null;
        }
        if (updateError) {
          const { error: directUpdateErr } = await supabase
            .from('properties')
            .update({
              sector_id: finalSectorId,
              location: location.trim(),
              house_no: houseNo.trim() || null,
              price: parsedPrice,
              type_id: finalTypeId,
              area_size: areaSize ? Number(areaSize) : null,
              area_unit: areaUnit || null,
              details: finalDetails,
              status: status,
              is_broker: isBroker,
            })
            .eq('id', editingPropertyId);

          if (directUpdateErr) throw updateError;
          if (cleanPhone) {
            await supabase.from('property_contacts').upsert({
              property_id: editingPropertyId,
              contact_name: ownerName.trim() || null,
              phone: cleanPhone,
            }).then();
          }
        } else {
          await supabase.from('properties').update({ is_broker: isBroker }).eq('id', editingPropertyId).then();
        }

        showToast({
          type: 'success',
          title: 'Property Updated',
          message: 'Property details updated successfully.',
        });
        setSessionAddedProperties((prev) =>
          prev.map((item) =>
            item.id === editingPropertyId
              ? {
                  ...item,
                  sector_name: cleanSectorName,
                  location: location.trim() || undefined,
                  house_no: houseNo.trim() || undefined,
                  price: parsedPrice,
                  type_id: finalTypeId,
                  type_name: targetTypeName,
                  area_size: areaSize ? Number(areaSize) : null,
                  area_unit: areaUnit,
                  details: finalDetails,
                  status,
                  is_broker: isBroker,
                  contact_name: ownerName.trim() || undefined,
                  phone: cleanPhone || undefined,
                  length_ft: lengthFt.trim() || undefined,
                  breadth_ft: breadthFt.trim() || undefined,
                  rate_value: rateValue.trim() || undefined,
                  rate_unit: rateUnit || undefined,
                }
              : item
          )
        );
      } else {
        const createParams: any = {
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
          p_phone: cleanPhone || '',
          p_is_broker: isBroker,
        };

        let { data, error: createError } = await supabase.rpc('create_property', createParams);
        if (createError && (createError.message?.includes('function') || createError.code === 'PGRST202')) {
          delete createParams.p_is_broker;
          const retry = await supabase.rpc('create_property', createParams);
          if (retry.error) createError = retry.error;
          else {
            createError = null;
            data = retry.data;
          }
        }
        if (createError) {
          const { data: directData, error: directErr } = await supabase
            .from('properties')
            .insert({
              sector_id: finalSectorId,
              location: location.trim(),
              house_no: houseNo.trim() || null,
              price: parsedPrice,
              type_id: finalTypeId,
              area_size: areaSize ? Number(areaSize) : null,
              area_unit: areaUnit || null,
              details: finalDetails,
              status: status,
              is_broker: isBroker,
            })
            .select('id, plot_id')
            .single();

          if (directErr) throw createError;
          data = [directData];
          if (cleanPhone) {
            await supabase.from('property_contacts').insert({
              property_id: directData.id,
              contact_name: ownerName.trim() || null,
              phone: cleanPhone,
            }).then();
          }
        } else if (data?.[0]?.id) {
          await supabase.from('properties').update({ is_broker: isBroker }).eq('id', data[0].id).then();
        }

        const newlyAddedId = data?.[0]?.id || ('prop-' + Date.now());
        let assignedId = formatPropertyId(data?.[0]?.plot_id || 'JSK-0000');

        // Guarantee strictly sequential plot_no without gaps:
        try {
          const { data: maxRow } = await supabase
            .from('properties')
            .select('plot_no')
            .neq('id', newlyAddedId)
            .order('plot_no', { ascending: false })
            .limit(1);

          const expectedNextPlotNo = (Number(maxRow?.[0]?.plot_no) || 0) + 1;
          const currentPlotMatch = assignedId.match(/\d+/);
          const currentPlotNo = currentPlotMatch ? Number(currentPlotMatch[0]) : 0;

          if (currentPlotNo !== expectedNextPlotNo && expectedNextPlotNo > 0) {
            const correctedPlotId = `JSK-${String(expectedNextPlotNo).padStart(4, '0')}`;
            await supabase
              .from('properties')
              .update({
                plot_no: expectedNextPlotNo,
                plot_id: correctedPlotId,
              })
              .eq('id', newlyAddedId);
            assignedId = correctedPlotId;
          }
        } catch {
          // Fallback to initial assignedId
        }

        showToast({
          type: 'success',
          title: `Property ID: ${assignedId}`,
          message: `Saved successfully! Assigned ${assignedId}`,
          duration: 6000,
        });

        const newSessionItem: SessionAddedProperty = {
          id: newlyAddedId,
          plot_id: assignedId,
          sector_name: cleanSectorName,
          location: location.trim() || undefined,
          house_no: houseNo.trim() || undefined,
          price: parsedPrice,
          type_id: finalTypeId,
          type_name: targetTypeName,
          area_size: areaSize ? Number(areaSize) : null,
          area_unit: areaUnit,
          details: finalDetails,
          status,
          is_broker: isBroker,
          contact_name: ownerName.trim() || undefined,
          phone: cleanPhone || undefined,
          length_ft: lengthFt.trim() || undefined,
          breadth_ft: breadthFt.trim() || undefined,
          rate_value: rateValue.trim() || undefined,
          rate_unit: rateUnit || undefined,
          added_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setSessionAddedProperties((prev) => [newSessionItem, ...prev.filter((p) => p.id !== newlyAddedId)]);
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
                    Length: {lengthFt} ft, Breadth: {breadthFt} ft ({Number(lengthFt) * Number(breadthFt)} sq ft)
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

          {/* Line 3: Locality (Left) & Landmark (Right) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Locality (Fast Direct Input with Datalist Suggestions) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Locality <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400">Type or pick from list</span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Sector 7, Urban Estate, or Mohan Nagar"
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
                    title="Clear locality"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* Instant Suggestion Dropdown as user types */}
                {isSectorDropdownOpen && filteredSectors.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden py-1 max-h-60 overflow-y-auto">
                    <div className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800/80">
                      {sectorInput.trim() ? `Matching Localities (${filteredSectors.length})` : 'All Available Localities'}
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

            {/* Right: Landmark */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Landmark <span className="text-slate-400 font-normal lowercase text-[11px]">(optional)</span>
                </label>
                <span className="text-[11px] text-slate-400">Nearby landmark or street</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Near Community Center, 60ft Road"
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

          {/* Line 6: Contact Details (Owner vs Broker) */}
          <div className="p-3.5 rounded-2xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  {isBroker ? 'Broker Contact Details (Confidential)' : 'Owner Contact Details (Confidential)'}
                </span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 bg-white/90 dark:bg-slate-900/90 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-800 shadow-xs select-none">
                  <input
                    type="checkbox"
                    checked={isBroker}
                    onChange={(e) => setIsBroker(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-amber-400 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Broker</span>
                </label>
              </div>
              <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                Protected
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Left: Phone No Field (Optional for both Owner & Broker) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {isBroker ? 'Broker Mobile Number' : 'Owner Mobile Number'}{' '}
                  <span className="text-slate-400 font-normal text-[11px]">(Optional)</span>
                </label>
                <input
                  type="tel"
                  placeholder="10-digit mobile (optional, e.g. 9876543210)"
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
                  {isBroker ? 'Broker / Agent Name' : 'Owner / Seller Name'} <span className="text-slate-400 font-normal">(Optional)</span>
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

            {/* Multi-Property Owner Notice (Permitted without restriction) */}
            {duplicateMatches.length > 0 && (
              <div className="p-3 rounded-xl bg-sky-50/90 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 text-sky-900 dark:text-sky-100 flex items-start gap-2 text-xs">
                <Building2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold">Multiple Properties Allowed:</span> This mobile number is also associated with {duplicateMatches.length} other listing{duplicateMatches.length > 1 ? 's' : ''}:
                  <div className="mt-1 flex flex-wrap gap-1">
                    {duplicateMatches.map((m, idx) => (
                      <span key={idx} className="font-mono font-semibold px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-700 text-[11px]">
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

      {/* Properties added during this session (shown underneath with edit option until page is refreshed) */}
      {sessionAddedProperties.length > 0 && (
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Recently Added Properties
                </h2>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {sessionAddedProperties.length} {sessionAddedProperties.length === 1 ? 'Property' : 'Properties'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Active in this session with quick edit option (persists until page refresh)
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {sessionAddedProperties.map((prop) => {
              const rateInfo = prop.rate_value
                ? {
                    rateValue: Number(prop.rate_value).toLocaleString('en-IN'),
                    rateUnit: prop.rate_unit === 'per_gaj' ? 'gaj' : prop.rate_unit === 'per_sqft' ? 'sqft' : 'acre',
                  }
                : extractRate(prop.details);

              const dims = prop.length_ft && prop.breadth_ft
                ? { length: `${prop.length_ft} ft`, breadth: `${prop.breadth_ft} ft` }
                : extractDimensions(prop.details);

              const isBeingEdited = editingPropertyId === prop.id;

              return (
                <div
                  key={prop.id}
                  className={`p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border transition-all ${
                    isBeingEdited
                      ? 'border-brand-500 ring-2 ring-brand-500/20 bg-brand-50/15 dark:bg-brand-950/20 shadow-md'
                      : 'border-slate-200 dark:border-slate-800 shadow-md hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-xs sm:text-sm px-2.5 py-1 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm">
                        {formatPropertyId(prop.plot_id)}
                      </span>
                      <span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                        {prop.type_name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          prop.is_broker
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                        }`}
                      >
                        {prop.is_broker ? 'Broker' : 'Owner'}
                      </span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        {prop.added_at}
                      </span>
                    </div>

                    {/* Action Buttons: Edit and Copy */}
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleCopySessionProperty(prop)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors min-h-[36px]"
                        title="Copy formatted text"
                      >
                        {copiedSessionId === prop.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                            <span>Copy Data</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleEditSessionProperty(prop)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[36px] shadow-sm ${
                          isBeingEdited
                            ? 'bg-amber-600 hover:bg-amber-700 text-white ring-2 ring-amber-400'
                            : 'bg-brand-600 hover:bg-brand-700 text-white'
                        }`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>{isBeingEdited ? 'Editing Above' : 'Edit Property'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Property Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3 text-xs">
                    <div>
                      <span className="text-slate-400 text-[11px] block">Locality / Landmark</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {prop.sector_name}
                        {prop.location ? ` • ${prop.location}` : ''}
                      </span>
                      {prop.house_no && (
                        <span className="block text-slate-500 dark:text-slate-400 text-[11px]">
                          House No: {prop.house_no}
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-slate-400 text-[11px] block">Price / Rate</span>
                      {rateInfo ? (
                        <span className="font-bold text-brand-600 dark:text-brand-400 text-sm block">
                          Price per {rateInfo.rateUnit}: ₹{rateInfo.rateValue}
                        </span>
                      ) : (
                        <span className="font-bold text-brand-600 dark:text-brand-400 text-sm block">
                          Total Cost: {formatPrice(prop.price)} asking (negotiable)
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-slate-400 text-[11px] block">Area & Dimensions</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {prop.area_size ? `${prop.area_size} ${prop.area_unit || 'sq yard'}` : 'N/A'}
                        {dims.length && dims.breadth ? ` • ${dims.length} × ${dims.breadth}` : ''}
                      </span>
                    </div>

                    {(prop.contact_name || prop.phone) && (
                      <div className="sm:col-span-2 md:col-span-3 pt-1 border-t border-slate-100 dark:border-slate-800/60 flex items-center gap-3">
                        <span className="text-slate-400 text-[11px]">Contact:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {prop.contact_name || (prop.is_broker ? 'Broker' : 'Owner')}
                          {prop.phone ? ` • ${normalizePhone(prop.phone).formatted || prop.phone}` : ''}
                        </span>
                      </div>
                    )}

                    {prop.details && extractCleanDetails(prop.details) && (
                      <div className="sm:col-span-2 md:col-span-3 text-slate-500 italic">
                        Note: {extractCleanDetails(prop.details)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
