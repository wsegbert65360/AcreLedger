# AcreLedger Precision Ag

A modern, high-performance farm management platform for precision agriculture.

## Key Features

- **Precision Rainfall (NOAA MRMS)**: Real-time rainfall data at 1km resolution, provided by NOAA Multi-Radar Multi-Sensor (MRMS) system.
- **PWA Update Logic**: Integrated manual and background service worker update checks for seamless versioning.
- **Expo-Ready Architecture**: Clean, structured metadata for simplified cross-platform (Web/Native) expansion.
- **Unit System**: All rainfall measurements are provided in **inches** for domestic agricultural standards.
- **Audit & Compliance**: Automated generation of Missouri MP693 Spray Logs and FSA-578 planting summaries.
- **Historical Backfill**: Automated gap detection and backfilling of historical weather data via Supabase Edge Functions.

## Technology Stack

- **React & Vite**: Fast development and HMR.
- **Supabase**: Backend-as-a-Service for Auth, Database (PostgreSQL), Edge Functions (Deno), and RLS.
- **HTTP/RPC Layer**: Automated synchronization via Supabase Edge Functions and custom PL/pgsql stats functions.
- **Radix UI & Tailwind CSS**: Accessible, premium design system.
- **Leaflet & Turf.js**: GIS mapping and acreage calculation.
- **Lucide React**: Iconography.
- **Zustand**: State management for farm records.

## Environment Variables

To run this project locally, add the following to your `.env.local` or `.env` file:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Weather API (Visual Crossing - for Wind & Temp)
VITE_VISUALCROSSING_KEY=your_visual_crossing_api_key
```

### Supabase Edge Functions

The following secrets must be set in your Supabase project for rainfall ingestion:

- `NOAA_MRMS_BASE_URL`: `https://vlab.noaa.gov/pub/tgmc/MRMS_Operational/`
- `SUPABASE_SERVICE_ROLE_KEY`: Your project's service role key for automated sync.

## Deployment & Updates (GitLab)

AcreLedger is deployed via **Vercel** (frontend) and **Supabase** (backend). 

### Continuous Deployment
Automatic deployments are triggered whenever changes are pushed to the `main` or `master` branches in **GitLab**. 

> [!IMPORTANT]
> Since transitioning from GitHub, ensure your Vercel project is re-linked to the GitLab repository to maintain automated deployments.

### Developer Workflow
To update the application, push your changes to GitLab:

```bash
# Stage your changes
git add .

# Commit your changes
git commit -m "Your description of changes"

# Push to GitLab
git push origin main
```

GitLab CI is configured to automatically run the test suite on every push.

