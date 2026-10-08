# 🏢 Bharat RealEstate — Master AI Context & Engineering Specification

> **Purpose of this document**:  
> This file contains the complete, exhaustive specification, architectural blueprint, business domain rules, database schema, security rules, and code patterns for **Bharat RealEstate**. Any AI assistant reading this document has full context to debug, extend, refactor, or test the codebase with zero prior knowledge.

---

## 1. Project Overview & Domain Context

* **Project Name**: Bharat RealEstate (`real_eastate`)
* **Repository**: `https://github.com/Satvik77777/Bharat-RealEstate`
* **Target Audience**: Indian real estate dealers, property brokers, and small agency teams (1–5 staff).
* **Operating Domain**: Indian Real Estate Market (specifically plot/land/residential deals in sectors and colonies).
* **Key Business Nuances**:
  * **Currencies**: Indian Rupees (₹), entered and quoted in **Lakh** (1 Lakh = 1,00,000 INR) and **Crore / Cr** (1 Crore = 1,00,00,000 INR).
  * **Plot Sizing Units**: **Gaj** (Sq. Yard, primary in North India), **Sq. Ft**, **Acre**, **Marla**, **Kanal**.
  * **Plot Numbering**: Auto-generated sequential Plot IDs formatted as `P-0001`, `P-0002`, `P-0042`, etc. They must never be entered manually, never duplicated, and never reused even after deletion.
  * **Dealer Confidentiality**: Owner contact numbers are trade secrets for dealers. A buyer must **never** see the seller's phone number, or the dealer loses their brokerage commission. Owner numbers must strictly be masked by default.

---

## 2. Technology Stack & Tooling

| Layer | Technology | Details / Version |
| :--- | :--- | :--- |
| **Language** | TypeScript | Version ~6.0.2 |
| **UI Framework** | React 19 | React 19.2.8 + React DOM 19.2.8 |
| **Routing** | React Router | `react-router-dom` v7.18.4 (Client-side SPA) |
| **Build & Dev Tool** | Vite | Vite 8.3.0 with `@vitejs/plugin-react` |
| **Styling** | TailwindCSS | Tailwind v3.4.19 + PostCSS + Autoprefixer |
| **Icons** | Lucide React | `lucide-react` v1.52.0 |
| **Database & Auth** | Supabase | `@supabase/supabase-js` v2.117.2 (PostgreSQL 15+) |
| **Linter** | Oxlint | `oxlint` v1.81.0 (Rust-based ultra-fast linter) |
| **Test Runner** | Vitest | `vitest` v5.0.3 (53 automated tests passing) |
| **Hosting Targets** | Render / Vercel | Static SPA hosting with `/* -> /index.html` rewrites |

---

## 3. Directory Structure & Key Files

```text
real_eastate/
├── .env                              # Active environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
├── .env.example                      # Template environment file
├── index.html                        # HTML entry point (title: Bharat RealEstate, Inter/Outfit fonts)
├── package.json                      # Scripts: dev, build, lint, preview, test
├── render.yaml                       # Render static site deployment blueprint with security headers
├── vercel.json                       # Vercel SPA routing rewrites & CSP headers
├── vite.config.ts                    # Vite build configuration (chunkSizeWarningLimit: 700)
├── .github/
│   └── workflows/
│       └── keep-alive.yml            # Weekly GitHub Action pinging Supabase to prevent 7-day free tier sleep
├── supabase/
│   ├── schema.sql                    # Master idempotent database schema (tables, RLS, functions, triggers)
│   ├── no_login_migration.sql        # Direct anonymous client migration for passwordless access
│   └── tests.sql                     # 9 SQL transaction-rollback test suites for Supabase SQL Editor
└── src/
    ├── App.tsx                       # Root React Router routing configuration
    ├── index.css                     # Tailwind directives, CSS root variables, custom scrollbars
    ├── main.tsx                      # React 19 createRoot bootstrap
    ├── components/
    │   ├── Layout.tsx                # App shell: Top navbar, mobile bottom navigation bar, theme toggle
    │   └── ProtectedRoute.tsx        # Route authorization guard (admin/staff)
    ├── context/
    │   ├── AuthContext.tsx           # Authentication session provider + localStorage mock fallback
    │   └── ToastContext.tsx          # Floating animated toast notification system (success, error, warning)
    ├── types/
    │   └── database.ts               # Complete TypeScript types & interfaces for all entities
    ├── lib/
    │   ├── supabase.ts               # Supabase client instantiation & configuration validation
    │   ├── price.ts                  # Integer rupee math converter & Lakh/Cr formatter (zero float drift)
    │   ├── phone.ts                  # Indian 10-digit phone validator & normalizer
    │   ├── whatsapp.ts               # WhatsApp click-to-chat link generator (10-property cap)
    │   ├── csv.ts                    # UTF-8 BOM CSV exporter with formula injection protection
    │   └── __tests__/
    │       ├── utilities.test.ts            # 28 unit tests (price, phone, WhatsApp, CSV)
    │       └── database.integration.test.ts # 25 live Supabase integration tests
    └── pages/
        ├── AddProperty.tsx           # Add / Edit property form with auto sector dropdown & phone duplicate check
        ├── BuyerRequirements.tsx     # Buyer CRM + budget filter chips + smart matching engine
        ├── SearchProperties.tsx      # Inventory search, quick price chips, phone unmask toggle, export
        ├── Settings.tsx              # Sectors manager, property types, and 1-click full CSV backup
        └── Login.tsx                 # Supabase email/password login view
```

---

## 4. Database Architecture & PostgreSQL Schema

### A. Core Tables (`supabase/schema.sql`)

#### 1. `public.sectors`
* **Purpose**: Sectors, colonies, and geographic locations (e.g., "Sector 14", "DLF Phase 1", "Mohan Nagar").
* **Columns**:
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  * `name`: `TEXT NOT NULL`
  * `created_by`: `UUID DEFAULT auth.uid()`
  * `created_at`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())`
  * `is_deleted`: `BOOLEAN NOT NULL DEFAULT FALSE`
* **Constraints**: Unique index on `lower(trim(name))` to prevent duplicate entries like "Sector 14" vs "sector 14".

#### 2. `public.property_types`
* **Purpose**: Categorization of real estate assets.
* **Columns**:
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  * `name`: `TEXT NOT NULL UNIQUE`
  * `sort_order`: `INT NOT NULL DEFAULT 1`
* **Default Rows**:
  1. Plot
  2. Commercial
  3. Residential (House/Kothi)
  4. Agricultural Land
  5. Flat/Apartment
  6. Industrial
  7. Farmhouse

#### 3. `public.properties`
* **Purpose**: Master inventory of all listed properties.
* **Columns**:
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  * `plot_no`: `BIGINT NOT NULL` (autoincrement sequence `properties_plot_no_seq`)
  * `plot_id`: `TEXT NOT NULL UNIQUE` (e.g. `P-0001`, `P-0042`)
  * `sector_id`: `UUID NOT NULL REFERENCES public.sectors(id)`
  * `location`: `TEXT NOT NULL` (street, landmarks, colony details)
  * `house_no`: `TEXT` (optional house/kothi number)
  * `price`: `BIGINT NOT NULL` (stored as exact integer rupees)
  * `type_id`: `UUID NOT NULL REFERENCES public.property_types(id)`
  * `area_size`: `NUMERIC`
  * `area_unit`: `TEXT CHECK (area_unit IN ('gaj', 'sq yard', 'marla', 'kanal', 'acre', 'sq ft'))`
  * `details`: `TEXT` (includes optional dimensions e.g. `[Dim: 30x60 ft | Rate: ₹45,000/gaj]`)
  * `status`: `TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold', 'hold'))`
  * `created_by`: `UUID DEFAULT auth.uid()`
  * `created_at`, `updated_at`: `TIMESTAMPTZ`
  * `is_deleted`: `BOOLEAN NOT NULL DEFAULT FALSE`

#### 4. `public.property_contacts` (Security Isolation Table)
* **Purpose**: Strictly stores confidential owner/seller personal information.
* **Columns**:
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  * `property_id`: `UUID NOT NULL UNIQUE REFERENCES public.properties(id) ON DELETE CASCADE`
  * `contact_name`: `TEXT`
  * `phone`: `TEXT NOT NULL` (normalized 10-digit mobile number)
  * `created_at`, `updated_at`: `TIMESTAMPTZ`
* **Security Architecture**:
  * This table has **zero public SELECT access** in production.
  * Standard property browsing queries join only against `properties`, returning `phone: null`.
  * The owner phone is only accessed via authorized stored procedures (`get_property_for_edit`, `search_properties` with `p_include_phone = true`, or `export_all`).

#### 5. `public.buyers`
* **Purpose**: Tracks client buyer requirements, preferences, and leads.
* **Columns**:
  * `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  * `name`: `TEXT NOT NULL`
  * `phone`: `TEXT NOT NULL`
  * `budget_min`: `BIGINT` (nullable, minimum budget in rupees)
  * `budget_max`: `BIGINT` (nullable, maximum budget in rupees)
  * `sector_ids`: `UUID[] NOT NULL DEFAULT '{}'` (array of preferred sector UUIDs)
  * `type_ids`: `UUID[] NOT NULL DEFAULT '{}'` (array of preferred property type UUIDs)
  * `notes`: `TEXT`
  * `status`: `TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed'))`
  * `followup_date`: `DATE`
  * `created_by`: `UUID DEFAULT auth.uid()`
  * `created_at`, `updated_at`: `TIMESTAMPTZ`
  * `is_deleted`: `BOOLEAN NOT NULL DEFAULT FALSE`

---

### B. PostgreSQL Stored Procedures (RPCs)

1. **`create_property(...)`**:
   * Atomically generates sequential plot number and writes the property and the owner contact row in a single transaction.
2. **`update_property(...)`**:
   * Updates property attributes and the corresponding contact row in `property_contacts`.
3. **`get_property_for_edit(p_id UUID)`**:
   * Returns full property details including unmasked owner name and phone number for editing.
4. **`soft_delete_property(p_id UUID)`**:
   * Sets `is_deleted = TRUE` on `properties`.
5. **`soft_delete_buyer(p_id UUID)`**:
   * Sets `is_deleted = TRUE` on `buyers`.
6. **`phone_exists(p_phone TEXT, p_exclude_property_id UUID)`**:
   * Normalizes the incoming phone number and checks `property_contacts` for duplicates across active listings.
   * If `p_exclude_property_id` is passed, excludes the current property ID to prevent false self-duplicate warnings during editing.
   * Returns: `TABLE (plot_id TEXT, location TEXT, status TEXT)`.
7. **`search_properties(...)`**:
   * Full search engine with:
     * `p_min_price`, `p_max_price`
     * `p_sector_ids UUID[]`
     * `p_type_ids UUID[]`
     * `p_statuses TEXT[]`
     * `p_plot_id TEXT`
     * `p_include_phone BOOLEAN` (controls whether contact phone is returned or masked to `NULL`)
     * `p_sort TEXT` (`'newest'`, `'price_asc'`, `'price_desc'`)
     * `p_limit INT`, `p_offset INT`
8. **`match_properties(p_buyer_id UUID)`**:
   * Fetches buyer record: `SELECT * INTO v_buyer FROM public.buyers b WHERE b.id = p_buyer_id AND b.is_deleted = FALSE;` *(Note: uses `b.id` to prevent ambiguity with the output column `id`)*.
   * Filters properties where:
     * `is_deleted = FALSE` AND `status = 'available'`
     * `price >= v_buyer.budget_min` (if set)
     * `price <= v_buyer.budget_max` (if set)
     * `sector_id = ANY(v_buyer.sector_ids)` (if set and non-empty)
     * `type_id = ANY(v_buyer.type_ids)` (if set and non-empty)
   * **Strict Privacy Rule**: Returned rows **never include owner phone number**.
9. **`export_all()`**:
   * Aggregates complete database records into a single JSONB object:
     `{ properties: [...], buyers: [...], sectors: [...], property_types: [...] }`
10. **`ping()`**:
    * Simple `SELECT 1` RPC for health checking and GitHub Actions keep-alive.

---

## 5. Critical Business Logic & Mathematical Calculations

### A. Integer Rupee Mathematics (`src/lib/price.ts`)
* **Problem**: Standard JavaScript floating point arithmetic (`0.1 + 0.2 !== 0.3`) causes drift when dealing with 7-digit to 9-digit real estate amounts (e.g. ₹1.15 Cr becomes `11499999.999999998`).
* **Solution**: Exact decimal splitting and integer multiplication.
  ```typescript
  // parsePriceInput('1.5', 'Cr') -> 15,000,000
  // parsePriceInput('75', 'Lakh') -> 7,500,000
  export const parsePriceInput = (value: string | number | null | undefined, unit: 'Lakh' | 'Cr'): number | null
  ```
* **Rules**:
  * Max 2 decimal places allowed.
  * Empty, whitespace, negative numbers, or invalid strings return `null`.
  * Format function `formatPrice(15000000)` formats to `₹1.5 Cr`, `formatPrice(7500000)` formats to `₹75 Lakh`.

### B. Indian Mobile Phone Normalization (`src/lib/phone.ts`)
* **Function**: `normalizePhone(phone: string)`
* **Rules**:
  * Strips all non-digit characters (`+`, `-`, spaces, `(`, `)`).
  * 12 digits starting with `91` &rarr; strip `91` prefix (take 10 digits).
  * 11 digits starting with `0` &rarr; strip `0` prefix (take 10 digits).
  * Validates that standard Indian numbers start with `6, 7, 8, 9` and have exactly 10 digits.
  * Output: `{ raw: '9876543210', formatted: '98765 43210', isValid: true }`.

### C. WhatsApp Message Construction (`src/lib/whatsapp.ts`)
* **Function**: `formatPropertiesMessage(properties: WhatsAppPropertyItem[])`
* **Rules**:
  * Formats clean, professional WhatsApp text summaries for selected properties.
  * Strictly capped at 10 properties per message to prevent URL length overflow.
  * **Never leaks owner phone**; only displays plot ID, sector, location, price, and dimensions.

### D. CSV Security & UTF-8 Encoding (`src/lib/csv.ts`)
* **Formula Injection Prevention**: Cells starting with `=`, `+`, `-`, or `@` are escaped with a leading `'` (`csvEscapeCell`).
* **UTF-8 BOM**: Prepends `\uFEFF` so Hindi (Devanagari) characters, colony names, and Rupee symbols render properly in Microsoft Excel without character encoding corruption.

---

## 6. Frontend Pages & Workflows

### 1. `SearchProperties.tsx` (`/` and `/search`)
* **Dashboard Summary Strip**: Real-time counter of available inventory, active buyers, and active inventory types.
* **Quick Budget Range Chips**: Buttons for `Up to 50 Lakh`, `50 Lakh to 1 Cr`, `1 to 2 Cr`, `2 to 5 Cr`, `5 Cr and above`.
* **Sector / Colony Autocomplete**: Dropdown opens on focus, filters live as user types (e.g. typing "1" or "sec"), and has a 1-click clear (`✕`) button.
* **Interactive Actions**:
  * 1-Tap Copy Single Property: Copies formatted details to clipboard.
  * Multi-select checkboxes: Select multiple properties &rarr; **Share on WhatsApp** or **Export Selected to CSV**.
  * Confidential Phone Toggle: Eye icon to unmask owner phone numbers (only for authenticated staff).

### 2. `AddProperty.tsx` (`/add-property`)
* **Property Type**: 1-click radio selection buttons.
* **Dimensions & Total Area**: Length & Breadth inputs auto-compute square yards/gaj; also accepts direct total area input.
* **Sector Input**: Autocomplete dropdown of existing sectors. If user types a new sector that does not exist, the app automatically creates it in the database upon save.
* **Live Duplicate Phone Warning**: Debounced query against `phone_exists` RPC alerts the user if the owner's phone already exists in another active listing.
* **Auto Plot ID**: On save, displays modal/toast with the assigned sequential plot ID (e.g. `P-0042`).

### 3. `BuyerRequirements.tsx` (`/buyers`)
* Record buyer name, phone, min budget, max budget, multi-sector tag selection, and multi-type selection.
* **Smart Matching Engine**: Clicking **"Find Matches"** executes `match_properties` RPC (with a resilient direct table query fallback in case of RPC error) to display all matching available inventory.
* Quick WhatsApp button sends formatted property recommendations directly to the buyer's phone.

### 4. `Settings.tsx` (`/settings`)
* Sector / Colony management (add, edit, soft-delete).
* 1-click **Export All to CSV** button: Generates complete spreadsheets for all properties and all buyers.

---

## 7. Testing Suite & Verification

* **Command**: `npm test` runs all Vitest tests.
* **Current Status**: **53 tests passing (100% pass rate)**.
* **Test Files**:
  1. `src/lib/__tests__/utilities.test.ts` (28 unit tests for price, phone, CSV, WhatsApp).
  2. `src/lib/__tests__/database.integration.test.ts` (25 live integration tests):
     * Connects directly to live Supabase cloud instance.
     * Tests sector creation, duplicate prevention, and retrieval.
     * Tests `create_property`, plot ID generation, core attributes, and contact isolation.
     * Tests `phone_exists` duplicate detection and self-exclusion during edit.
     * Tests `search_properties` price bounds, sector filters, and phone masking.
     * Tests `update_property` and `soft_delete_property`.
     * Tests `buyers` CRUD, multi-sector arrays, and soft delete.
     * Tests `match_properties` smart matching engine, excluding out-of-budget, wrong-sector, or sold properties.
     * Tests `export_all` RPC schema.
     * **100% Teardown**: Guaranteed hard-cleanup in `afterAll` and `finally` blocks, verifying zero leftover test records in the database.

---

## 8. Common Pitfalls & Known Edge Cases

1. **PostgreSQL Ambiguity in Functions with `RETURNS TABLE`**:
   * When writing PL/pgSQL functions that return a table with column `id UUID`, never write `WHERE id = p_id` inside queries. PostgreSQL treats `id` as ambiguous between the table column and output variable. Always alias the table: `WHERE b.id = p_id`.
2. **Owner Contact Privacy**:
   * Never join `property_contacts` into public property queries without verifying staff authorization.
   * Never include seller phone numbers in `match_properties` output sent to buyers.
3. **Price Integers**:
   * Never store prices as floats. Always parse with `parsePriceInput` and store as `BIGINT` rupees.
4. **Vercel vs Render Hosting**:
   * Vercel's free tier has non-commercial clauses. Render or Cloudflare Pages are recommended for business portals.
   * When hosting on any static host, ensure SPA routing rewrites (`/* -> /index.html`) are configured (handled via `render.yaml` and `vercel.json`).

---

## 9. Developer Commands Cheatsheet

```powershell
# Install all dependencies
npm install

# Run the test suite (53 tests)
npm test

# Start local development server
npm run dev
# Browser: http://localhost:5173

# Type-check and production build
npm run build

# Run fast linter
npm run lint
```
