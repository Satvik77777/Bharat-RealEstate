import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  Calendar,
  MessageCircle,
  Copy,
  Trash2,
  Edit3,
  Sparkles,
  Loader2,
  Check,
  Clock,
  Building,
  Building2,
  Home,
  MapPin,
  X,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { parsePriceInput, formatPrice, type PriceUnit } from '../lib/price';
import { normalizePhone } from '../lib/phone';
import { buildWhatsAppLink, formatPropertiesMessage, type WhatsAppPropertyItem } from '../lib/whatsapp';
import { formatPropertyId } from '../lib/propertyFormat';
import { CopyPhoneIcon } from './SearchProperties';
import {
  type PropertyCategory,
  type PropertySubType,
  residentialOptions,
  commercialOptions,
  getTypeIdForSubType,
} from './AddProperty';
import type { Buyer, Sector, PropertyType, Property } from '../types/database';

export const BuyerRequirements: React.FC = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  // References
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [minBudgetVal, setMinBudgetVal] = useState('');
  const [minBudgetUnit, setMinBudgetUnit] = useState<PriceUnit>('Lakh');
  const [maxBudgetVal, setMaxBudgetVal] = useState('');
  const [maxBudgetUnit, setMaxBudgetUnit] = useState<PriceUnit>('Cr');
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  // Property Category & Sub-Type states (matching Add Property and Search)
  const [selectedCategory, setSelectedCategory] = useState<PropertyCategory>('residential');
  const [selectedSubType, setSelectedSubType] = useState<PropertySubType | null>(null);

  // Category switch handler (Residential vs Commercial)
  const handleCategoryChange = (category: PropertyCategory) => {
    setSelectedCategory(category);
    if (selectedSubType) {
      if (category === 'residential') {
        if (selectedSubType === 'shop' || selectedSubType === 'agriculture' || selectedSubType === 'industry') {
          setSelectedSubType('plot');
          const tid = getTypeIdForSubType('plot', propertyTypes);
          setSelectedTypes(tid ? [tid] : []);
        } else {
          const tid = getTypeIdForSubType(selectedSubType, propertyTypes);
          setSelectedTypes(tid ? [tid] : []);
        }
      } else {
        if (selectedSubType === 'home' || selectedSubType === 'flat' || selectedSubType === 'farmhouse') {
          setSelectedSubType('plot');
          const tid = getTypeIdForSubType('plot', propertyTypes);
          setSelectedTypes(tid ? [tid] : []);
        } else {
          const tid = getTypeIdForSubType(selectedSubType, propertyTypes);
          setSelectedTypes(tid ? [tid] : []);
        }
      }
    }
  };

  // Sub-type radio switch handler (Plot, Home, Flat, Other, etc.)
  const handleSubTypeClick = (subType: PropertySubType) => {
    if (selectedSubType === subType) {
      // Toggle off / clear filter (Any Type)
      setSelectedSubType(null);
      setSelectedTypes([]);
    } else {
      setSelectedSubType(subType);
      const tid = getTypeIdForSubType(subType, propertyTypes);
      setSelectedTypes(tid ? [tid] : []);
    }
  };
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'active' | 'closed'>('active');
  const [followupDate, setFollowupDate] = useState('');
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  // Specific sector input and dropdown state
  const [sectorInput, setSectorInput] = useState('');
  const [isSectorDropdownOpen, setIsSectorDropdownOpen] = useState(false);

  // Filtered sectors for live interactive autocomplete dropdown
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

  const handleQuickRange = (range: (typeof quickRanges)[number]) => {
    if (
      minBudgetVal === range.minVal &&
      minBudgetUnit === range.minUnit &&
      maxBudgetVal === range.maxVal &&
      maxBudgetUnit === range.maxUnit
    ) {
      setMinBudgetVal('');
      setMaxBudgetVal('');
    } else {
      setMinBudgetVal(range.minVal);
      setMinBudgetUnit(range.minUnit as PriceUnit);
      setMaxBudgetVal(range.maxVal);
      setMaxBudgetUnit(range.maxUnit as PriceUnit);
    }
  };

  const handleSelectSector = (secId: string) => {
    if (!selectedSectors.includes(secId)) {
      setSelectedSectors((prev) => [...prev, secId]);
    }
    setSectorInput('');
    setIsSectorDropdownOpen(false);
  };

  const handleAddCustomSector = async () => {
    const cleanName = sectorInput.trim();
    if (!cleanName) return;

    const match = sectors.find((s) => s.name.toLowerCase() === cleanName.toLowerCase());
    if (match) {
      handleSelectSector(match.id);
      return;
    }

    try {
      if (!isSupabaseConfigured) {
        const newSec: Sector = {
          id: 'sec-' + Date.now(),
          name: cleanName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_deleted: false,
        };
        setSectors((prev) => [...prev, newSec]);
        setSelectedSectors((prev) => [...prev, newSec.id]);
        setSectorInput('');
        setIsSectorDropdownOpen(false);
        showToast({ type: 'success', title: 'Area Added', message: `Added "${cleanName}"` });
        return;
      }

      const { data: newSecData, error: secError } = await supabase
        .from('sectors')
        .insert({ name: cleanName })
        .select('id, name')
        .single();

      if (secError) throw secError;
      if (newSecData) {
        setSectors((prev) => [...prev, newSecData as Sector]);
        setSelectedSectors((prev) => [...prev, newSecData.id]);
        setSectorInput('');
        setIsSectorDropdownOpen(false);
        showToast({ type: 'success', title: 'Area Added', message: `Added "${cleanName}"` });
      }
    } catch (err: any) {
      showToast({ type: 'error', title: 'Error', message: err.message || 'Could not add area' });
    }
  };

  // Editing state
  const [editingBuyerId, setEditingBuyerId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Filtering list
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('active');

  // Matching Modal State
  const [matchingBuyer, setMatchingBuyer] = useState<Buyer | null>(null);
  const [matchedProperties, setMatchedProperties] = useState<Property[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);

  // Delete modal
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load buyers and references
  const loadData = async () => {
    setIsLoading(true);
    try {
      if (!isSupabaseConfigured) {
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

        const savedBuyers = JSON.parse(localStorage.getItem('re_mock_buyers') || '[]');
        setBuyers(savedBuyers);
        setIsLoading(false);
        return;
      }

      const { data: sData } = await supabase.from('sectors').select('*').eq('is_deleted', false).order('name');
      if (sData) setSectors(sData);

      const { data: tData } = await supabase.from('property_types').select('*').order('sort_order');
      if (tData) setPropertyTypes(tData);

      const { data: bData, error } = await supabase
        .from('buyers')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (bData) setBuyers(bData);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Network Error', message: err.message || 'Could not fetch buyers' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setName('');
    setPhone('');
    setMinBudgetVal('');
    setMinBudgetUnit('Lakh');
    setMaxBudgetVal('');
    setMaxBudgetUnit('Cr');
    setSelectedSectors([]);
    setSelectedTypes([]);
    setSelectedCategory('residential');
    setSelectedSubType(null);
    setNotes('');
    setStatus('active');
    setFollowupDate('');
    setSectorInput('');
    setIsSectorDropdownOpen(false);
    setErrors({});
    setEditingBuyerId(null);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) newErrors.name = 'Buyer name is required';

    const normPhone = normalizePhone(phone);
    if (!normPhone.isValid) {
      newErrors.phone = normPhone.error || 'Valid 10-digit mobile number required';
    }

    const minP = parsePriceInput(minBudgetVal, minBudgetUnit);
    const maxP = parsePriceInput(maxBudgetVal, maxBudgetUnit);

    if (minP !== null && maxP !== null && minP > maxP) {
      newErrors.budget = 'Minimum budget cannot exceed maximum budget';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveBuyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const minP = parsePriceInput(minBudgetVal, minBudgetUnit);
      const maxP = parsePriceInput(maxBudgetVal, maxBudgetUnit);
      const cleanPhone = normalizePhone(phone).raw;

      if (!isSupabaseConfigured) {
        const saved = JSON.parse(localStorage.getItem('re_mock_buyers') || '[]');
        if (editingBuyerId) {
          const updated = saved.map((b: Buyer) =>
            b.id === editingBuyerId
              ? {
                  ...b,
                  name: name.trim(),
                  phone: cleanPhone,
                  budget_min: minP,
                  budget_max: maxP,
                  sector_ids: selectedSectors,
                  type_ids: selectedTypes,
                  notes: notes.trim() || null,
                  status,
                  followup_date: followupDate || null,
                  updated_at: new Date().toISOString(),
                }
              : b
          );
          localStorage.setItem('re_mock_buyers', JSON.stringify(updated));
          showToast({ type: 'success', title: 'Buyer Updated', message: 'Requirement saved successfully' });
        } else {
          const newBuyer: Buyer = {
            id: 'buyer-' + Date.now(),
            name: name.trim(),
            phone: cleanPhone,
            budget_min: minP,
            budget_max: maxP,
            sector_ids: selectedSectors,
            type_ids: selectedTypes,
            notes: notes.trim() || null,
            status,
            followup_date: followupDate || null,
            created_at: new Date().toISOString(),
            is_deleted: false,
          };
          localStorage.setItem('re_mock_buyers', JSON.stringify([newBuyer, ...saved]));
          showToast({ type: 'success', title: 'Buyer Added', message: `${newBuyer.name} registered` });
        }

        resetForm();
        loadData();
        setIsSubmitting(false);
        return;
      }

      if (editingBuyerId) {
        const { error } = await supabase
          .from('buyers')
          .update({
            name: name.trim(),
            phone: cleanPhone,
            budget_min: minP,
            budget_max: maxP,
            sector_ids: selectedSectors,
            type_ids: selectedTypes,
            notes: notes.trim() || null,
            status,
            followup_date: followupDate || null,
          })
          .eq('id', editingBuyerId);

        if (error) throw error;
        showToast({ type: 'success', title: 'Buyer Updated', message: 'Requirement updated successfully' });
      } else {
        const { error } = await supabase.from('buyers').insert({
          name: name.trim(),
          phone: cleanPhone,
          budget_min: minP,
          budget_max: maxP,
          sector_ids: selectedSectors,
          type_ids: selectedTypes,
          notes: notes.trim() || null,
          status,
          followup_date: followupDate || null,
        });

        if (error) throw error;
        showToast({ type: 'success', title: 'Buyer Added', message: `${name.trim()} added to buyers list` });
      }

      resetForm();
      await loadData();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Save Failed', message: err.message || 'Could not save buyer' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditBuyer = (buyer: Buyer) => {
    setEditingBuyerId(buyer.id);
    setName(buyer.name);
    setPhone(buyer.phone);

    // Safe integer-only price->display string: avoids float rounding noise
    const priceToDisplay = (rupees: number): { val: string; unit: PriceUnit } => {
      const ONE_CR = 10_000_000;
      const ONE_LAKH = 100_000;
      if (rupees >= ONE_CR) {
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

    if (buyer.budget_min) {
      const { val, unit } = priceToDisplay(buyer.budget_min);
      setMinBudgetVal(val);
      setMinBudgetUnit(unit);
    } else {
      setMinBudgetVal('');
    }

    if (buyer.budget_max) {
      const { val, unit } = priceToDisplay(buyer.budget_max);
      setMaxBudgetVal(val);
      setMaxBudgetUnit(unit);
    } else {
      setMaxBudgetVal('');
    }

    setSelectedSectors(buyer.sector_ids || []);
    setSelectedTypes(buyer.type_ids || []);

    if (buyer.type_ids && buyer.type_ids.length > 0) {
      const typeId = buyer.type_ids[0];
      const t = propertyTypes.find((x) => x.id === typeId);
      if (t) {
        const norm = t.name.toLowerCase();
        if (norm.includes('house') || norm.includes('kothi') || norm.includes('home')) {
          setSelectedCategory('residential');
          setSelectedSubType('home');
        } else if (norm.includes('flat') || norm.includes('apartment')) {
          setSelectedCategory('residential');
          setSelectedSubType('flat');
        } else if (norm.includes('shop')) {
          setSelectedCategory('commercial');
          setSelectedSubType('shop');
        } else if (norm.includes('agri') || norm.includes('farm')) {
          setSelectedCategory('commercial');
          setSelectedSubType('agriculture');
        } else if (norm.includes('indus')) {
          setSelectedCategory('commercial');
          setSelectedSubType('industry');
        } else if (norm.includes('plot')) {
          setSelectedCategory('residential');
          setSelectedSubType('plot');
        } else {
          setSelectedCategory('residential');
          setSelectedSubType('other');
        }
      } else {
        setSelectedCategory('residential');
        setSelectedSubType(null);
      }
    } else {
      setSelectedCategory('residential');
      setSelectedSubType(null);
    }

    setNotes(buyer.notes || '');
    setStatus(buyer.status);
    setFollowupDate(buyer.followup_date || '');
    setSectorInput('');
    setIsSectorDropdownOpen(false);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteBuyer = async (buyerId: string) => {
    if (!isAdmin) {
      showToast({ type: 'error', title: 'Permission Denied', message: 'Only administrators can delete buyers' });
      return;
    }

    try {
      if (!isSupabaseConfigured) {
        const saved = JSON.parse(localStorage.getItem('re_mock_buyers') || '[]');
        const filtered = saved.filter((b: Buyer) => b.id !== buyerId);
        localStorage.setItem('re_mock_buyers', JSON.stringify(filtered));
        showToast({ type: 'success', title: 'Deleted', message: 'Buyer requirement removed' });
        setDeletingId(null);
        loadData();
        return;
      }

      const { error } = await supabase.rpc('soft_delete_buyer', { p_id: buyerId });
      if (error) throw error;

      showToast({ type: 'success', title: 'Deleted', message: 'Buyer requirement deleted' });
      setDeletingId(null);
      await loadData();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Delete Failed', message: err.message || 'Could not delete buyer' });
    }
  };

  // Find Matches via match_properties RPC (Strictly NEVER returns owner phone)
  const handleFindMatches = async (buyer: Buyer) => {
    setMatchingBuyer(buyer);
    setIsLoadingMatches(true);
    try {
      if (!isSupabaseConfigured) {
        const allProps: any[] = JSON.parse(localStorage.getItem('re_mock_properties') || '[]');
        const matches = allProps.filter((p) => {
          if (p.is_deleted || p.status !== 'available') return false;
          if (buyer.budget_min && p.price < buyer.budget_min) return false;
          if (buyer.budget_max && p.price > buyer.budget_max) return false;
          if (buyer.sector_ids && buyer.sector_ids.length > 0 && !buyer.sector_ids.includes(p.sector_id)) return false;
          if (buyer.type_ids && buyer.type_ids.length > 0 && !buyer.type_ids.includes(p.type_id)) return false;
          return true;
        });

        // Ensure owner phone is NEVER included in matches
        const sanitized = matches.map((m) => ({
          ...m,
          phone: null,
          contact_name: null,
        }));

        setMatchedProperties(sanitized);
        setIsLoadingMatches(false);
        return;
      }

      let matchedList: Property[] = [];
      const { data, error } = await supabase.rpc('match_properties', { p_buyer_id: buyer.id });
      
      if (!error && Array.isArray(data)) {
        matchedList = data;
      } else {
        // Resilient fallback: direct query matching engine
        let query = supabase
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
          .eq('status', 'available');

        if (buyer.budget_min) {
          query = query.gte('price', buyer.budget_min);
        }
        if (buyer.budget_max) {
          query = query.lte('price', buyer.budget_max);
        }
        if (buyer.sector_ids && buyer.sector_ids.length > 0) {
          query = query.in('sector_id', buyer.sector_ids);
        }
        if (buyer.type_ids && buyer.type_ids.length > 0) {
          query = query.in('type_id', buyer.type_ids);
        }

        const { data: fbData, error: fbErr } = await query.order('price', { ascending: true });
        if (fbErr) throw (error || fbErr);

        matchedList = (fbData || []).map((p: any) => ({
          ...p,
          sector_name: p.sectors?.name,
          type_name: p.property_types?.name,
          phone: null, // STRICT: Never expose seller phone to buyer
          contact_name: null,
        }));
      }

      setMatchedProperties(matchedList);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Matching Error', message: err.message || 'Could not fetch matches' });
    } finally {
      setIsLoadingMatches(false);
    }
  };

  // WhatsApp send to buyer
  const handleSendMatchedWhatsApp = () => {
    if (!matchingBuyer || matchedProperties.length === 0) return;

    const propItems: WhatsAppPropertyItem[] = matchedProperties.map((p) => ({
      plot_id: p.plot_id,
      sector_name: p.sector_name,
      location: p.location,
      type_name: p.type_name,
      price: p.price,
      area_size: p.area_size,
      area_unit: p.area_unit,
      phone: null, // NEVER send owner phone to buyers
    }));

    const header = `Hello ${matchingBuyer.name}, here are properties matching your requirements:`;
    const message = formatPropertiesMessage(propItems, header);
    const link = buildWhatsAppLink(matchingBuyer.phone, message);
    window.open(link, '_blank');
  };

  const handleCopyMatchedMessage = async () => {
    if (!matchingBuyer || matchedProperties.length === 0) return;

    const propItems: WhatsAppPropertyItem[] = matchedProperties.map((p) => ({
      plot_id: p.plot_id,
      sector_name: p.sector_name,
      location: p.location,
      type_name: p.type_name,
      price: p.price,
      area_size: p.area_size,
      area_unit: p.area_unit,
      phone: null,
    }));

    const header = `Hello ${matchingBuyer.name}, here are properties matching your requirements:`;
    const message = formatPropertiesMessage(propItems, header);
    try {
      await navigator.clipboard.writeText(message);
      showToast({ type: 'success', title: 'Copied', message: 'Matching properties message copied to clipboard' });
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'Could not copy message' });
    }
  };

  const handleCopyPhoneNumber = async (rawPhone: string | null | undefined, id: string) => {
    if (!rawPhone) return;
    const norm = normalizePhone(rawPhone);
    const phoneToCopy = norm.raw || rawPhone.trim();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(phoneToCopy);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = phoneToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedPhoneId(id);
      setTimeout(() => setCopiedPhoneId(null), 1500);
      showToast({
        type: 'success',
        title: 'Phone Copied!',
        message: `${phoneToCopy} copied to clipboard`,
      });
    } catch {
      showToast({ type: 'error', title: 'Copy Failed', message: 'Could not access clipboard' });
    }
  };

  // Follow-up due today / overdue detection
  const isFollowupDueOrOverdue = (dateStr: string | null) => {
    if (!dateStr) return false;
    const today = new Date().toISOString().slice(0, 10);
    return dateStr <= today;
  };

  // Filtered buyers list
  const filteredBuyers = buyers.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return b.name.toLowerCase().includes(q) || b.phone.includes(q) || (b.notes && b.notes.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <Users className="w-7 h-7 text-brand-600 dark:text-brand-400" />
            <span>Buyer Requirements & Matching</span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Capture client demand and automatically match against available inventory
          </p>
        </div>

        {editingBuyerId && (
          <button
            type="button"
            onClick={resetForm}
            className="self-start sm:self-auto px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            Cancel Edit
          </button>
        )}
      </div>

      {/* Buyer Registration Form */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">
          {editingBuyerId ? 'Edit Buyer Requirement' : 'Register New Buyer Demand'}
        </h2>

        <form onSubmit={handleSaveBuyer} className="space-y-5">
          {/* Property Category & Type Selection (Matching Add Property and Search) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>Preferred Property Category & Type</span>
              </label>
              <div className="flex items-center gap-3">
                {selectedSubType ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSubType(null);
                      setSelectedTypes([]);
                    }}
                    className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-semibold"
                  >
                    Clear type / Any Type
                  </button>
                ) : (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    Any Type Selected
                  </span>
                )}
                <span className="text-[11px] text-slate-400">1-click select</span>
              </div>
            </div>

            {/* Step 1: Top 2 Options (Residential vs Commercial) */}
            <div className="grid grid-cols-2 gap-3">
              {/* Option 1: Residential */}
              <button
                type="button"
                id="buyer-category-residential-btn"
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
                id="buyer-category-commercial-btn"
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
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSubTypeClick(opt.id)}
                      className={`flex-1 min-w-fit flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl border text-xs sm:text-sm font-medium cursor-pointer transition-all select-none text-center ${
                        isSelected
                          ? 'border-brand-600 bg-brand-50/90 text-brand-700 dark:bg-brand-950/70 dark:border-brand-500 dark:text-brand-200 shadow-sm font-semibold ring-1 ring-brand-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'border-brand-600 dark:border-brand-400 bg-white dark:bg-slate-900'
                            : 'border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-brand-600 dark:bg-brand-400" />
                        )}
                      </span>
                      <span className="whitespace-nowrap">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 1. Client Contact Details (2 Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Client Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Vikram Singhal"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white min-h-[42px] ${
                  errors.name ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                }`}
              />
              {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Client Mobile Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                placeholder="10-digit number (e.g. 9812345678)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white min-h-[42px] ${
                  errors.phone ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                }`}
              />
              {errors.phone && <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>}
            </div>
          </div>

          {/* 2. Budget Range with Quick Budget Options directly above */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Budget Range <span className="text-slate-400 font-normal">(Optional)</span>
            </span>

            {/* Quick Budget Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {quickRanges.map((range, idx) => {
                const isActive =
                  minBudgetVal === range.minVal &&
                  minBudgetUnit === range.minUnit &&
                  maxBudgetVal === range.maxVal &&
                  maxBudgetUnit === range.maxUnit;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleQuickRange(range)}
                    className={`px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all min-h-[34px] flex items-center justify-center ${
                      isActive
                        ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                        : 'border-slate-200 dark:border-slate-700/70 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-300'
                    }`}
                  >
                    <span>{range.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Minimum & Maximum Budget in 2 Equal Columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 mb-1 block font-medium">
                  Minimum Budget
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 50 or 1"
                    value={minBudgetVal}
                    onChange={(e) => setMinBudgetVal(e.target.value)}
                    className="flex-1 min-w-0 py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white min-h-[42px]"
                  />
                  <select
                    value={minBudgetUnit}
                    onChange={(e) => setMinBudgetUnit(e.target.value as PriceUnit)}
                    className="w-24 py-2.5 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold dark:text-white min-h-[42px]"
                  >
                    <option value="Lakh">Lakh</option>
                    <option value="Cr">Cr</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 mb-1 block font-medium">
                  Maximum Budget
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 1.5 or 3"
                    value={maxBudgetVal}
                    onChange={(e) => setMaxBudgetVal(e.target.value)}
                    className="flex-1 min-w-0 py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white min-h-[42px]"
                  />
                  <select
                    value={maxBudgetUnit}
                    onChange={(e) => setMaxBudgetUnit(e.target.value as PriceUnit)}
                    className="w-24 py-2.5 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold dark:text-white min-h-[42px]"
                  >
                    <option value="Cr">Cr</option>
                    <option value="Lakh">Lakh</option>
                  </select>
                </div>
              </div>
            </div>
            {errors.budget && <p className="text-xs text-rose-500 mt-1">{errors.budget}</p>}
          </div>

          {/* 3. Preferred Sector / Colony (Full Width with Any Sector + Specific Area Input) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Preferred Sector / Colony <span className="text-slate-400 font-normal">(Default: Any Sector)</span>
              </label>
              {selectedSectors.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedSectors([])}
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-semibold"
                >
                  Reset to Any Sector
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              {/* Default: Any Sector Button */}
              <button
                type="button"
                onClick={() => setSelectedSectors([])}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all border shrink-0 min-h-[42px] ${
                  selectedSectors.length === 0
                    ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 ring-2 ring-brand-500/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <Check
                  className={`w-4 h-4 ${
                    selectedSectors.length === 0 ? 'text-brand-600 dark:text-brand-400 stroke-[3]' : 'opacity-20'
                  }`}
                />
                <span>Any Sector / Colony</span>
              </button>

              {/* Specific Area Input with Live Autocomplete */}
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Type specific area (e.g. Mohan Nagar, Sector 7)..."
                  value={sectorInput}
                  onFocus={() => setIsSectorDropdownOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setIsSectorDropdownOpen(false), 200);
                  }}
                  onChange={(e) => {
                    setSectorInput(e.target.value);
                    setIsSectorDropdownOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (filteredSectors.length > 0) {
                        handleSelectSector(filteredSectors[0].id);
                      } else if (sectorInput.trim()) {
                        handleAddCustomSector();
                      }
                    }
                  }}
                  className="w-full py-2.5 px-3.5 pl-9 pr-9 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white font-medium min-h-[42px]"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                {sectorInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSectorInput('');
                      setIsSectorDropdownOpen(false);
                    }}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Clear"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* Suggestion Dropdown */}
                {isSectorDropdownOpen && (
                  <div className="absolute z-30 left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden py-1 max-h-60 overflow-y-auto">
                    <div className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800/80">
                      {sectorInput.trim() ? `Matching Sectors (${filteredSectors.length})` : 'Popular / All Sectors'}
                    </div>
                    {filteredSectors.map((s) => {
                      const isAlreadyAdded = selectedSectors.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectSector(s.id);
                          }}
                          className={`w-full text-left px-3.5 py-2 text-xs sm:text-sm flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                            isAlreadyAdded ? 'text-brand-600 font-semibold' : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>{s.name}</span>
                          </div>
                          {isAlreadyAdded && <Check className="w-3.5 h-3.5 text-brand-600" />}
                        </button>
                      );
                    })}
                    {sectorInput.trim() &&
                      !sectors.some((s) => s.name.toLowerCase() === sectorInput.trim().toLowerCase()) && (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleAddCustomSector();
                          }}
                          className="w-full text-left px-3.5 py-2.5 text-xs sm:text-sm flex items-center gap-2 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40 font-semibold border-t border-slate-100 dark:border-slate-800"
                        >
                          <span>+ Add &quot;{sectorInput.trim()}&quot; as specific area</span>
                        </button>
                      )}
                  </div>
                )}
              </div>
            </div>

            {/* Selected Specific Sector Badges */}
            {selectedSectors.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Specific Areas:</span>
                {selectedSectors.map((secId) => {
                  const sec = sectors.find((s) => s.id === secId);
                  if (!sec) return null;
                  return (
                    <span
                      key={secId}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300 text-xs font-semibold shadow-sm"
                    >
                      <MapPin className="w-3 h-3 text-brand-500" />
                      <span>{sec.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedSectors((prev) => prev.filter((id) => id !== secId))}
                        className="hover:text-rose-500 ml-0.5 p-0.5"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. Follow-up Date & Notes in 2 Balanced Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Follow-up Date <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={followupDate}
                  onChange={(e) => setFollowupDate(e.target.value)}
                  className="w-full py-2.5 px-3 pl-9 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white min-h-[42px]"
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Client Specific Preferences / Notes
              </label>
              <input
                type="text"
                placeholder="e.g. Urgent requirement, prefers corner plot or park facing..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white min-h-[42px]"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 px-6 rounded-xl font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{editingBuyerId ? 'Update Buyer' : 'Save Buyer Requirement'}</span>
              )}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 min-h-[44px]"
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Buyer Directory & Matching Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Registered Buyers Directory</h2>

          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search buyer or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="py-1.5 px-3 pl-8 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="py-1.5 px-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold dark:text-white"
            >
              <option value="active">Active Only</option>
              <option value="closed">Closed Only</option>
              <option value="all">All Statuses</option>
            </select>
          </div>
        </div>

        {/* Buyers List */}
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-600" />
            <p className="text-xs">Loading buyers...</p>
          </div>
        ) : filteredBuyers.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 text-sm">
            No buyer records found. Use the form above to add a client requirement.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredBuyers.map((b) => {
              const isOverdue = isFollowupDueOrOverdue(b.followup_date);
              const budgetText =
                b.budget_min && b.budget_max
                  ? `${formatPrice(b.budget_min)} - ${formatPrice(b.budget_max)}`
                  : b.budget_min
                  ? `Min ${formatPrice(b.budget_min)}`
                  : b.budget_max
                  ? `Up to ${formatPrice(b.budget_max)}`
                  : 'Any Budget';

              return (
                <div
                  key={b.id}
                  className={`p-4 rounded-2xl bg-white dark:bg-slate-900 border transition-all shadow-sm ${
                    isOverdue && b.status === 'active'
                      ? 'border-amber-400 bg-amber-50/20 dark:bg-amber-950/20'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-slate-900 dark:text-white">{b.name}</h3>
                        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400">
                            {normalizePhone(b.phone).formatted}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyPhoneNumber(b.phone, b.id);
                            }}
                            title="Copy phone number only"
                            aria-label={`Copy phone number ${b.phone}`}
                            className="p-0.5 rounded hover:bg-white dark:hover:bg-slate-700 transition-colors flex items-center justify-center text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400"
                          >
                            {copiedPhoneId === b.id ? (
                              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <CopyPhoneIcon className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            b.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-600 dark:text-slate-400">
                        <span>
                          💰 Budget: <strong className="text-slate-900 dark:text-white">{budgetText}</strong>
                        </span>
                        {b.followup_date && (
                          <span
                            className={`flex items-center gap-1 ${
                              isOverdue ? 'text-amber-600 font-bold' : 'text-slate-500'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>Follow-up: {b.followup_date} {isOverdue && '(Due/Overdue)'}</span>
                          </span>
                        )}
                      </div>

                      {b.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic mt-1">
                          &ldquo;{b.notes}&rdquo;
                        </p>
                      )}
                    </div>

                    {/* Actions: Find Matches, Edit, Delete */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleFindMatches(b)}
                        className="py-2 px-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm min-h-[44px]"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Find Matches</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleEditBuyer(b)}
                        className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        title="Edit Buyer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setDeletingId(b.id)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Delete Buyer (Admin Only)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Matching Properties Modal Dialog */}
      {matchingBuyer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-brand-600" />
                  <span>Matching Inventory for {matchingBuyer.name}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Direct match via match_properties RPC (Budget, Sector, Type). Owner contacts are strictly omitted.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMatchingBuyer(null)}
                className="text-slate-400 hover:text-slate-600 p-2 min-h-[44px] min-w-[44px]"
              >
                ✕
              </button>
            </div>

            <div className="py-4 max-h-[50vh] overflow-y-auto space-y-3">
              {isLoadingMatches ? (
                <div className="p-8 text-center text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-600" />
                  <p className="text-xs">Finding available matches...</p>
                </div>
              ) : matchedProperties.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-slate-500">
                  <Building className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">No Properties Currently Match</h4>
                  <p className="text-xs mt-1">
                    No active available property falls within this client's budget and criteria.
                  </p>
                </div>
              ) : (
                matchedProperties.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold px-2 py-0.5 rounded bg-white dark:bg-slate-900 border text-brand-700 dark:text-brand-300">
                          {formatPropertyId(p.plot_id)}
                        </span>
                        <strong className="text-slate-900 dark:text-white">{p.type_name} in {p.sector_name}</strong>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 mt-1">{p.location}</p>
                      {p.area_size && (
                        <p className="text-slate-500">Area: {p.area_size} {p.area_unit}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-extrabold text-brand-600 dark:text-brand-400 block">
                        {formatPrice(p.price)}
                      </span>
                      <span className="text-[11px] text-emerald-600 font-semibold uppercase">{p.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Bottom Actions */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={handleCopyMatchedMessage}
                disabled={matchedProperties.length === 0}
                className="py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 min-h-[44px]"
              >
                <Copy className="w-4 h-4" />
                <span>Copy Message</span>
              </button>

              <button
                type="button"
                onClick={handleSendMatchedWhatsApp}
                disabled={matchedProperties.length === 0}
                className="py-2.5 px-4 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-emerald-700 disabled:opacity-40 min-h-[44px]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Send to Buyer on WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Delete Buyer Record?</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              This buyer will be soft-deleted and removed from the active directory.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBuyer(deletingId)}
                className="px-4 py-2 text-sm rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
