# AcreLedger Precision Ag

A modern, high-performance farm management platform for precision agriculture.

## Key Features

- **Precision Rainfall (NOAA MRMS)**: Real-time rainfall data at 1km resolution, provided by NOAA Multi-Radar Multi-Sensor (MRMS) system.
- **Unit System**: All rainfall measurements are provided in **inches** for domestic agricultural standards.
- **Audit & Compliance**: Automated generation of Missouri MP693 Spray Logs and FSA-578 planting summaries.
- **Historical Backfill**: automated gap detection and backfilling of historical weather data.

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

## Deployment

AcreLedger is designed for Vercel (frontend) and Supabase (backend). Continuous deployment is configured for the `master` and `main` branches.
