export type UserRole = 'admin' | 'staff';

export interface Profile {
  user_id: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Sector {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface PropertyType {
  id: string;
  name: string;
  sort_order: number;
}

export type PropertyStatus = 'available' | 'sold' | 'hold' | 'not_interested';

export type AreaUnit = 'gaj' | 'sq yard' | 'marla' | 'kanal' | 'acre' | 'sq ft';

export interface Property {
  id: string;
  plot_no: number;
  plot_id: string;
  sector_id: string;
  sector_name?: string;
  location: string;
  house_no: string | null;
  price: number;
  type_id: string;
  type_name?: string;
  area_size: number | null;
  area_unit: AreaUnit | null;
  details: string | null;
  status: PropertyStatus;
  contact_name?: string | null;
  phone?: string | null;
  is_broker?: boolean;
  created_at: string;
  updated_at?: string;
  is_deleted?: boolean;
}

export interface Buyer {
  id: string;
  name: string;
  phone: string;
  budget_min: number | null;
  budget_max: number | null;
  sector_ids: string[];
  type_ids: string[];
  notes: string | null;
  status: 'active' | 'closed';
  followup_date: string | null;
  created_at: string;
  updated_at?: string;
  is_deleted: boolean;
}

export interface DuplicatePhoneMatch {
  plot_id: string;
  location: string;
  status: string;
}
