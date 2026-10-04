import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { parsePriceInput, formatPrice, type PriceUnit } from '../lib/price';
import { normalizePhone } from '../lib/phone';
import { buildWhatsAppLink, formatPropertiesMessage, type WhatsAppPropertyItem } from '../lib/whatsapp';
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
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'active' | 'closed'>('active');
  const [followupDate, setFollowupDate] = useState('');

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
    setNotes('');
    setStatus('active');
    setFollowupDate('');
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
    setNotes(buyer.notes || '');
    setStatus(buyer.status);
    setFollowupDate(buyer.followup_date || '');

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

      const { data, error } = await supabase.rpc('match_properties', { p_buyer_id: buyer.id });
      if (error) throw error;

      setMatchedProperties(data || []);
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
          {/* Name & Mobile */}
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
                className={`w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white ${
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
                className={`w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white ${
                  errors.phone ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                }`}
              />
              {errors.phone && <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>}
            </div>
          </div>

          {/* Budget Min/Max */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
              Budget Range (Optional)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 mb-1 block">Minimum Budget</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 50 or 1"
                    value={minBudgetVal}
                    onChange={(e) => setMinBudgetVal(e.target.value)}
                    className="flex-1 py-2 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                  />
                  <select
                    value={minBudgetUnit}
                    onChange={(e) => setMinBudgetUnit(e.target.value as PriceUnit)}
                    className="w-24 py-2 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold dark:text-white"
                  >
                    <option value="Lakh">Lakh</option>
                    <option value="Cr">Cr</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 mb-1 block">Maximum Budget</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 1.5 or 3"
                    value={maxBudgetVal}
                    onChange={(e) => setMaxBudgetVal(e.target.value)}
                    className="flex-1 py-2 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                  />
                  <select
                    value={maxBudgetUnit}
                    onChange={(e) => setMaxBudgetUnit(e.target.value as PriceUnit)}
                    className="w-24 py-2 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold dark:text-white"
                  >
                    <option value="Cr">Cr</option>
                    <option value="Lakh">Lakh</option>
                  </select>
                </div>
              </div>
            </div>
            {errors.budget && <p className="text-xs text-rose-500 mt-2">{errors.budget}</p>}
          </div>

          {/* Preferred Sectors (Multi) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Preferred Sectors <span className="text-slate-400 font-normal">(Empty = Any Sector)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {sectors.map((s) => {
                const isSelected = selectedSectors.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setSelectedSectors((prev) =>
                        prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                      )
                    }
                    className={`py-1.5 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all min-h-[38px] ${
                      isSelected
                        ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-brand-600" />}
                    <span>{s.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preferred Property Types (Multi) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Preferred Property Types <span className="text-slate-400 font-normal">(Empty = Any Type)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {propertyTypes.map((t) => {
                const isSelected = selectedTypes.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setSelectedTypes((prev) =>
                        prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                      )
                    }
                    className={`py-1.5 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all min-h-[38px] ${
                      isSelected
                        ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-brand-600" />}
                    <span>{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status & Follow-up Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Client Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'closed')}
                className="w-full py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white"
              >
                <option value="active">Active (Seeking Property)</option>
                <option value="closed">Closed / Deal Done</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Follow-up Date <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={followupDate}
                  onChange={(e) => setFollowupDate(e.target.value)}
                  className="w-full py-2.5 px-3 pl-9 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white"
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Client Specific Preferences / Notes
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Urgent requirement, prefers corner plot or park facing..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white"
            />
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
                        <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {normalizePhone(b.phone).formatted}
                        </span>
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
                          {p.plot_id}
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
