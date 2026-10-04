# 🏢 Bharat RealEstate - Dealer Management Portal

A secure, mobile-first web app built specifically for Indian real estate dealers and property brokers. Built entirely with free tools and free-tier services.

---

## 🚀 Key Features

- **Sequential Auto-Generated Plot IDs**: Unique numbers formatted as `P-0001`, `P-0002`, `P-0042`, etc. Never typed manually and never reused even after deletion.
- **Indian Real Estate Price Filters**: Inclusive price bounds (e.g. Min 1 Cr & Max 1 Cr filters exactly 1 Cr). Quick filter chips for "Up to 50 Lakh", "50 Lakh to 1 Cr", "1 to 2 Cr", "2 to 5 Cr", and "5 Cr and above".
- **Zero Float Inaccuracies**: All prices parsed and handled using exact string/BigInt integer arithmetic.
- **Confidential Owner Contacts**: Owner mobile numbers are isolated in a protected table (`property_contacts`) with **zero direct SELECT policies**. Unchecked phone toggle never transmits numbers across the network.
- **Duplicate Phone Warning**: Flags duplicate mobile numbers across listings without blocking valid repeat clients.
- **WhatsApp Integration**: Single-tap WhatsApp sharing with messages cleanly formatted and capped at 10 properties.
- **Buyer Requirement Matching**: Instant matching between buyer budgets/sectors and active properties with direct WhatsApp share.
- **Excel-Ready UTF-8 BOM CSV Exports**: Export filtered properties, buyer leads, and full dealer backups with CSV formula injection protection and Hindi (Devanagari) character support.
- **Mobile-First & Accessible**: Tested for screens down to 360px with touch targets of at least 44px, bottom mobile navigation, and instant light/dark mode.

---

## 💰 Free-Tier Limits Overview

Every service used is 100% free:

| Service | Free Tier Allowance | Important Notes |
| :--- | :--- | :--- |
| **Supabase (PostgreSQL + Auth)** | 500 MB Database, 50,000 MAU, 5 GB Bandwidth, 2 Projects | Pauses after 7 days of inactivity. Kept alive automatically by our GitHub Actions cron job. No automated backups on free tier. |
| **Render (Static Sites)** | 100 GB/month bandwidth, unlimited static sites | **Primary host**. Free for commercial static sites. |
| **Cloudflare Pages** | Unlimited requests, 500 builds/month | Excellent alternative host with fast global CDN. |
| **Netlify** | 100 GB/month bandwidth, 300 build minutes/month | Alternative static host with instant deploys. |
| **Vercel** | 100 GB bandwidth, 6,000 build minutes/month | ⚠️ **Warning**: Vercel's free "Hobby" plan is **non-commercial only**. Check their terms before hosting client production sites. |

---

## 🛠️ Step-by-Step Setup Guide (Non-Developer Friendly)

### Step 1: Create a Free Supabase Project
1. Go to [supabase.com](https://supabase.com) and click **Start your project** (sign up for free).
2. Click **New project**, choose an organization, set a project name (e.g. `bharat-realestate`), and generate a strong database password.
3. Select your closest region (e.g., `South Asia (Mumbai)` for Indian dealers).
4. Wait 1–2 minutes while Supabase provisions your PostgreSQL database.

### Step 2: Run Database Schema
1. In your Supabase Dashboard, click on **SQL Editor** in the left sidebar.
2. Open the file [`supabase/schema.sql`](file:///c:/Users/46sat/Desktop/real_eastate/supabase/schema.sql) in this repository, copy its entire contents, and paste it into the Supabase SQL editor.
3. Click **Run** (green button). You will see `Success. No rows returned`.
4. *(Optional verification)*: Open [`supabase/tests.sql`](file:///c:/Users/46sat/Desktop/real_eastate/supabase/tests.sql), paste into SQL Editor, and click **Run** to execute the database test suite.

### Step 3: Disable Public Signups
Because this is a private dealer portal for 1 to 4 trusted users:
1. In your Supabase Dashboard, navigate to **Authentication** > **Providers** > **Email**.
2. Uncheck **"Allow new users to sign up"**.
3. Click **Save**.

### Step 4: Create Dealer Users & Promote First Admin
1. In Supabase Dashboard, go to **Authentication** > **Users**.
2. Click **Add user** > **Create user**.
3. Enter the email and password for your first user (e.g., `dealer@yourfirm.com`).
4. Now, go to the **SQL Editor** and run this single-line SQL command to promote that user to **Admin**:

```sql
UPDATE public.profiles SET role = 'admin' WHERE user_id = (SELECT id FROM auth.users WHERE email = 'dealer@yourfirm.com');
```

5. You can create up to 3 additional staff users by adding them in the **Authentication > Users** tab. They will automatically be granted the `staff` role by the database trigger.

### Step 5: Get Project Keys
1. In Supabase Dashboard, go to **Project Settings** (gear icon) > **API**.
2. Copy the **Project URL** (starts with `https://...supabase.co`).
3. Copy the **anon / public** key (starts with `eyJ...`).
> ⚠️ **CRITICAL SECURITY RULE**: NEVER use or copy the `service_role` secret key into this project. Frontend code must strictly use the `anon` key only.

---

## 💻 Running Locally

1. Clone or download this project.
2. In the project root, duplicate `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and fill in your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```
4. Install dependencies:
   ```bash
   npm install
   ```
5. Run the unit test suite:
   ```bash
   npm test
   ```
6. Start the local development server:
   ```bash
   npm run dev
   ```
7. Open `http://localhost:5173` in your browser.

---

## 🌐 Production Deployment to Render (Primary)

Render is our recommended primary host because its free tier allows static business websites.

1. Push your repository to **GitHub**.
2. Sign in to [render.com](https://render.com) using your GitHub account.
3. Click **New +** > **Static Site**.
4. Connect your GitHub repository.
5. In the configuration settings:
   - **Name**: `bharat-realestate`
   - **Branch**: `main`
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
6. Click **Advanced** > **Add Environment Variable**:
   - `VITE_SUPABASE_URL`: paste your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY`: paste your Supabase Anon Key
7. **Important SPA Refresh Rule**:
   Our repository includes a [`render.yaml`](file:///c:/Users/46sat/Desktop/real_eastate/render.yaml) file with the rewrite rule `/* -> /index.html`. If you configure Render manually in their dashboard instead of using Blueprints, go to **Redirects/Rewrites** and add:
   - **Type**: `Rewrite`
   - **Source**: `/*`
   - **Destination**: `/index.html`
   *(Without this rewrite rule, refreshing any subpage like `/search` or `/buyers` will give a 404 error).*
8. Click **Create Static Site**. Your application will be live in 1–2 minutes with a free HTTPS URL!

---

## 🔄 Alternative Deployment Options

### Option A: Cloudflare Pages
1. Sign in to [Cloudflare Dashboard](https://dash.cloudflare.com) > **Workers & Pages**.
2. Click **Create Application** > **Pages** > **Connect to Git**.
3. Build preset: **Vite**, Build command: `npm run build`, Output directory: `dist`.
4. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Cloudflare automatically reads [`public/_redirects`](file:///c:/Users/46sat/Desktop/real_eastate/public/_redirects) and [`public/_headers`](file:///c:/Users/46sat/Desktop/real_eastate/public/_headers).

### Option B: Netlify
1. Sign in to [netlify.com](https://netlify.com) > **Add new site** > **Import an existing project**.
2. Publish directory: `dist`. Build command: `npm run build`.
3. Set environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Netlify automatically reads [`public/_redirects`](file:///c:/Users/46sat/Desktop/real_eastate/public/_redirects) for SPA routing.

### Option C: Vercel
1. Sign in to [vercel.com](https://vercel.com) > **Add New Project**.
2. Select your repository. Framework preset: **Vite**.
3. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Vercel automatically respects [`vercel.json`](file:///c:/Users/46sat/Desktop/real_eastate/vercel.json) for rewrites and security headers.
5. ⚠️ *Reminder: Verify Vercel's commercial terms for your business.*

---

## ⏰ Supabase Free Tier Keep-Alive (Prevent Pausing)

Supabase pauses free projects after **7 days of inactivity**. To prevent this:
1. In your GitHub repository, go to **Settings** > **Secrets and variables** > **Actions**.
2. Click **New repository secret**:
   - `SUPABASE_URL`: your Supabase Project URL
   - `SUPABASE_ANON_KEY`: your Supabase Anon Key
3. Our workflow in [`.github/workflows/keep-alive.yml`](file:///c:/Users/46sat/Desktop/real_eastate/.github/workflows/keep-alive.yml) runs every 3 days to invoke the lightweight `ping()` database function.
4. ⚠️ **GitHub Inactivity Rule**: GitHub automatically disables scheduled workflows if a repository has no commits or activity for 60 consecutive days. If you haven't committed in 50 days, simply make a minor commit or manually trigger the workflow from the Actions tab.

---

## 💾 Weekly Data Backup Routine

Supabase Free Tier does not include point-in-time recovery or automatic scheduled daily backups.

### How to Take a Manual Weekly Backup (Takes 30 seconds):
1. Log into your web app as **Admin**.
2. Navigate to **Settings** (or `/settings`).
3. Click the **"Export All Data (CSV)"** button.
4. Your browser will download clean, formatted CSV backups of all properties (including confidential owner contacts) and all buyer leads.
5. Store these CSV files in your dealer Google Drive or secure offline storage weekly.

---

## ⚖️ Indian Digital Personal Data Protection (DPDP) Act Compliance Notice

- Under India's **Digital Personal Data Protection Act, 2023 (DPDP Act)**, property owner phone numbers and buyer requirement records constitute personal data.
- **Dealer Responsibility**:
  1. Only store contact information for individuals who have given clear consent to be contacted regarding real estate transactions.
  2. Do not publicly broadcast owner numbers. Our app's "Show Owner Phone" checkbox is default-off to protect privacy.
  3. When an owner or buyer asks to have their contact deleted, use the soft-delete function or contact database administrator to fulfill their erasure request.

---

## 🧪 Testing Summary

- **Unit Tests**: 28 Vitest tests covering string/BigInt price arithmetic, phone parsing & formatting, WhatsApp links, and CSV formula injection prevention. Run via:
  ```bash
  npm test
  ```
- **Database Tests**: 9 SQL test suites covering RLS isolation, anon privilege locks, price range inclusiveness, plot ID sequence permanence, and soft-delete protections. Run by pasting [`supabase/tests.sql`](file:///c:/Users/46sat/Desktop/real_eastate/supabase/tests.sql) into the Supabase SQL editor.
