import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Layers,
  MapPin,
  Download,
  Plus,
  Trash2,
  Edit2,
  Check,
  Loader2,
  ShieldAlert,
  Database,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { generateCsv, downloadCsv } from '../lib/csv';
import { formatPrice } from '../lib/price';
import { formatPropertyId } from '../lib/propertyFormat';
import type { Sector, PropertyType } from '../types/database';

export const Settings: React.FC = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [sectors, setSectors] = useState<Sector[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Sector form
  const [newSectorName, setNewSectorName] = useState('');
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [editSectorName, setEditSectorName] = useState('');

  // Property type form
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeSort, setNewTypeSort] = useState(1);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editTypeName, setEditTypeName] = useState('');
  const [editTypeSort, setEditTypeSort] = useState(1);

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (!isSupabaseConfigured) {
        const mockS = JSON.parse(localStorage.getItem('re_mock_sectors') || 'null') || [
          { id: 'sec-1', name: 'Sector 14', is_deleted: false },
          { id: 'sec-2', name: 'Sector 15', is_deleted: false },
          { id: 'sec-3', name: 'Golf Course Road', is_deleted: false },
          { id: 'sec-4', name: 'DLF Phase 1', is_deleted: false },
        ];
        const mockT = JSON.parse(localStorage.getItem('re_mock_types') || 'null') || [
          { id: 'type-1', name: 'Plot', sort_order: 1 },
          { id: 'type-2', name: 'Commercial', sort_order: 2 },
          { id: 'type-3', name: 'Residential (House/Kothi)', sort_order: 3 },
          { id: 'type-4', name: 'Agricultural Land', sort_order: 4 },
          { id: 'type-5', name: 'Flat/Apartment', sort_order: 5 },
          { id: 'type-6', name: 'Industrial', sort_order: 6 },
          { id: 'type-7', name: 'Farmhouse', sort_order: 7 },
        ];
        setSectors(mockS);
        setPropertyTypes(mockT);
        setIsLoading(false);
        return;
      }

      const { data: sData } = await supabase.from('sectors').select('*').eq('is_deleted', false).order('name');
      if (sData) setSectors(sData);

      const { data: tData } = await supabase.from('property_types').select('*').order('sort_order');
      if (tData) setPropertyTypes(tData);
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'Could not load settings data' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (!isAdmin) {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-sm text-slate-500 mt-2">Only system administrators can access these settings.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-brand-600" />
        <p className="text-sm font-medium">Loading settings...</p>
      </div>
    );
  }

  // Handle Sector Add
  const handleAddSector = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newSectorName.trim();
    if (!cleanName) return;

    try {
      if (!isSupabaseConfigured) {
        const updated = [...sectors, { id: 'sec-' + Date.now(), name: cleanName, is_deleted: false, created_at: '', updated_at: '' }];
        setSectors(updated);
        localStorage.setItem('re_mock_sectors', JSON.stringify(updated));
        setNewSectorName('');
        showToast({ type: 'success', title: 'Sector Added', message: cleanName });
        return;
      }

      const { error } = await supabase.from('sectors').insert({ name: cleanName });
      if (error) throw error;

      setNewSectorName('');
      showToast({ type: 'success', title: 'Sector Added', message: cleanName });
      loadData();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Failed to Add Sector', message: err.message });
    }
  };

  // Handle Sector Update
  const handleUpdateSector = async (id: string) => {
    const cleanName = editSectorName.trim();
    if (!cleanName) return;

    try {
      if (!isSupabaseConfigured) {
        const updated = sectors.map((s) => (s.id === id ? { ...s, name: cleanName } : s));
        setSectors(updated);
        localStorage.setItem('re_mock_sectors', JSON.stringify(updated));
        setEditingSectorId(null);
        showToast({ type: 'success', title: 'Sector Updated', message: cleanName });
        return;
      }

      const { error } = await supabase.from('sectors').update({ name: cleanName }).eq('id', id);
      if (error) throw error;

      setEditingSectorId(null);
      showToast({ type: 'success', title: 'Sector Updated', message: cleanName });
      loadData();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Update Failed', message: err.message });
    }
  };

  // Handle Sector Soft Delete
  const handleDeleteSector = async (id: string) => {
    try {
      if (!isSupabaseConfigured) {
        const updated = sectors.filter((s) => s.id !== id);
        setSectors(updated);
        localStorage.setItem('re_mock_sectors', JSON.stringify(updated));
        showToast({ type: 'success', title: 'Sector Deleted', message: 'Sector removed' });
        return;
      }

      const { error } = await supabase.from('sectors').update({ is_deleted: true }).eq('id', id);
      if (error) throw error;

      showToast({ type: 'success', title: 'Sector Deleted', message: 'Sector soft-deleted' });
      loadData();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Delete Failed', message: err.message });
    }
  };

  // Handle Type Add
  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newTypeName.trim();
    if (!cleanName) return;

    try {
      if (!isSupabaseConfigured) {
        const updated = [...propertyTypes, { id: 'type-' + Date.now(), name: cleanName, sort_order: Number(newTypeSort) || 1 }];
        setPropertyTypes(updated);
        localStorage.setItem('re_mock_types', JSON.stringify(updated));
        setNewTypeName('');
        showToast({ type: 'success', title: 'Type Added', message: cleanName });
        return;
      }

      const { error } = await supabase.from('property_types').insert({ name: cleanName, sort_order: Number(newTypeSort) || 1 });
      if (error) throw error;

      setNewTypeName('');
      showToast({ type: 'success', title: 'Type Added', message: cleanName });
      loadData();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Failed to Add Type', message: err.message });
    }
  };

  // Handle Type Update
  const handleUpdateType = async (id: string) => {
    const cleanName = editTypeName.trim();
    if (!cleanName) return;

    try {
      if (!isSupabaseConfigured) {
        const updated = propertyTypes.map((t) => (t.id === id ? { ...t, name: cleanName, sort_order: Number(editTypeSort) || 1 } : t));
        setPropertyTypes(updated);
        localStorage.setItem('re_mock_types', JSON.stringify(updated));
        setEditingTypeId(null);
        showToast({ type: 'success', title: 'Type Updated', message: cleanName });
        return;
      }

      const { error } = await supabase
        .from('property_types')
        .update({ name: cleanName, sort_order: Number(editTypeSort) || 1 })
        .eq('id', id);

      if (error) throw error;
      setEditingTypeId(null);
      showToast({ type: 'success', title: 'Type Updated', message: cleanName });
      loadData();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Update Failed', message: err.message });
    }
  };

  // Export All Data (Admin Only via export_all() RPC)
  const handleExportAllData = async () => {
    setIsExporting(true);
    try {
      if (!isSupabaseConfigured) {
        const mockProps = JSON.parse(localStorage.getItem('re_mock_properties') || '[]');
        const mockBuyers = JSON.parse(localStorage.getItem('re_mock_buyers') || '[]');

        // Generate properties CSV
        const propHeaders = ['Property ID', 'Sector', 'Location', 'Price (Rs)', 'Type', 'Area', 'Status', 'Owner Name', 'Owner Phone'];
        const propRows = mockProps.map((p: any) => [
          formatPropertyId(p.plot_id),
          p.sector_name,
          p.location,
          p.price,
          p.type_name,
          `${p.area_size || ''} ${p.area_unit || ''}`.trim(),
          p.status,
          p._mockContactName || '',
          p._mockPhone || '',
        ]);
        const propCsv = generateCsv(propHeaders, propRows);
        downloadCsv(`admin_export_properties_${Date.now()}.csv`, propCsv);

        // Generate buyers CSV
        const buyerHeaders = ['Name', 'Phone', 'Min Budget', 'Max Budget', 'Status', 'Followup Date', 'Notes'];
        const buyerRows = mockBuyers.map((b: any) => [
          b.name,
          b.phone,
          b.budget_min ? formatPrice(b.budget_min) : 'Any',
          b.budget_max ? formatPrice(b.budget_max) : 'Any',
          b.status,
          b.followup_date || '',
          b.notes || '',
        ]);
        const buyerCsv = generateCsv(buyerHeaders, buyerRows);
        downloadCsv(`admin_export_buyers_${Date.now()}.csv`, buyerCsv);

        showToast({ type: 'success', title: 'Export Complete', message: 'All database data exported to CSV' });
        setIsExporting(false);
        return;
      }

      const { data, error } = await supabase.rpc('export_all');
      if (error) throw error;

      if (data) {
        // 1. Export Properties with Owner Phones
        if (data.properties && Array.isArray(data.properties)) {
          const headers = [
            'Property ID',
            'Sector',
            'Location',
            'House No',
            'Price (Rupees)',
            'Price (Formatted)',
            'Type',
            'Area Size',
            'Area Unit',
            'Details',
            'Status',
            'Owner Name',
            'Owner Phone',
            'Is Deleted',
          ];
          const rows = data.properties.map((p: any) => [
            formatPropertyId(p.plot_id),
            p.sector || '',
            p.location || '',
            p.house_no || '',
            p.price,
            formatPrice(p.price),
            p.property_type || '',
            p.area_size || '',
            p.area_unit || '',
            p.details || '',
            p.status,
            p.owner_name || '',
            p.owner_phone || '',
            p.is_deleted ? 'Yes' : 'No',
          ]);
          downloadCsv(`admin_export_all_properties_${Date.now()}.csv`, generateCsv(headers, rows));
        }

        // 2. Export Buyers
        if (data.buyers && Array.isArray(data.buyers)) {
          const headers = [
            'Buyer ID',
            'Name',
            'Phone',
            'Min Budget',
            'Max Budget',
            'Status',
            'Followup Date',
            'Notes',
            'Is Deleted',
          ];
          const rows = data.buyers.map((b: any) => [
            b.id,
            b.name,
            b.phone,
            b.budget_min || '',
            b.budget_max || '',
            b.status,
            b.followup_date || '',
            b.notes || '',
            b.is_deleted ? 'Yes' : 'No',
          ]);
          downloadCsv(`admin_export_all_buyers_${Date.now()}.csv`, generateCsv(headers, rows));
        }

        showToast({ type: 'success', title: 'Export Successful', message: 'Full system backup downloaded' });
      }
    } catch (err: any) {
      showToast({ type: 'error', title: 'Export Failed', message: err.message || 'Could not export database' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
          <SettingsIcon className="w-7 h-7 text-brand-600 dark:text-brand-400" />
          <span>Dealer Administration</span>
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Manage sectors, property classifications, and complete data exports
        </p>
      </div>

      {/* Full Database Export Section (Admin Only) */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-brand-50 to-indigo-50/50 dark:from-slate-900 dark:to-brand-950/40 border border-brand-200 dark:border-brand-900 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-600" />
            <span>Complete Business Data Backup</span>
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-md">
            Download all inventory (including owner contacts), buyer preferences, and sectors formatted with UTF-8 BOM for Microsoft Excel.
          </p>
        </div>

        <button
          type="button"
          disabled={isExporting}
          onClick={handleExportAllData}
          className="py-3 px-5 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs flex items-center gap-2 shadow-md shadow-brand-500/20 disabled:opacity-50 min-h-[44px]"
        >
          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span>Export All Data (CSV)</span>
        </button>
      </div>

      {/* Sector Management */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <MapPin className="w-5 h-5 text-brand-600" />
          <span>Manage Sectors & Colonies</span>
        </h2>

        {/* Add Sector Form */}
        <form onSubmit={handleAddSector} className="flex gap-2">
          <input
            type="text"
            placeholder="Add new sector name (e.g. Sector 57)"
            value={newSectorName}
            onChange={(e) => setNewSectorName(e.target.value)}
            className="flex-1 py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white"
          />
          <button
            type="submit"
            className="py-2 px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-xs rounded-xl flex items-center gap-1.5 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Sector</span>
          </button>
        </form>

        {/* Sectors Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
          {sectors.map((s) => (
            <div
              key={s.id}
              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
            >
              {editingSectorId === s.id ? (
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={editSectorName}
                    onChange={(e) => setEditSectorName(e.target.value)}
                    className="flex-1 py-1 px-2 text-xs bg-slate-100 dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdateSector(s.id)}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{s.name}</span>
              )}

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditingSectorId(s.id);
                    setEditSectorName(s.name);
                  }}
                  className="p-1 text-slate-400 hover:text-brand-600 rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSector(s.id)}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Property Types Management */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-brand-600" />
          <span>Manage Property Types</span>
        </h2>

        {/* Add Type Form */}
        <form onSubmit={handleAddType} className="flex gap-2">
          <input
            type="text"
            placeholder="Add new property type (e.g. Studio Apartment)"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            className="flex-1 py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white"
          />
          <input
            type="number"
            placeholder="Order"
            value={newTypeSort}
            onChange={(e) => setNewTypeSort(Number(e.target.value))}
            className="w-20 py-2 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white"
          />
          <button
            type="submit"
            className="py-2 px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-xs rounded-xl flex items-center gap-1.5 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Type</span>
          </button>
        </form>

        {/* Types List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
          {propertyTypes.map((t) => (
            <div
              key={t.id}
              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
            >
              {editingTypeId === t.id ? (
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={editTypeName}
                    onChange={(e) => setEditTypeName(e.target.value)}
                    className="flex-1 py-1 px-2 text-xs bg-slate-100 dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700 dark:text-white"
                  />
                  <input
                    type="number"
                    value={editTypeSort}
                    onChange={(e) => setEditTypeSort(Number(e.target.value))}
                    className="w-16 py-1 px-1 text-xs bg-slate-100 dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdateType(t.id)}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold flex items-center justify-center text-slate-500">
                    {t.sort_order}
                  </span>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{t.name}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setEditingTypeId(t.id);
                  setEditTypeName(t.name);
                  setEditTypeSort(t.sort_order);
                }}
                className="p-1 text-slate-400 hover:text-brand-600 rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
