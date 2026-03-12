# AcreLedger Precision Ag

A modern, high-performance farm management platform for precision agriculture.

## Technology Stack

- **React & Vite**: Fast development and HMR.
- **Supabase**: Backend-as-a-Service for Auth, Database (PostgreSQL), and RLS.
- **Radix UI & Tailwind CSS**: Accessible, premium design system.
- **Leaflet & Turf.js**: GIS mapping and acreage calculation.
- **Lucide React**: Iconography.
- **Zustand (implied by farmStore pattern)**: State management for farm records.

## Environment Variables

To run this project, you need to add the following environment variables to your `.env.local` or `.env` file:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Weather API (Visual Crossing)
VITE_VISUALCROSSING_KEY=your_visual_crossing_api_key
```

### Obtaining API Keys

1. **Supabase**: Create a project at [supabase.com](https://supabase.com/). Find your credentials in Project Settings > API.
2. **Visual Crossing**: Sign up for a free tier at [visualcrossing.com/weather-api](https://www.visualcrossing.com/weather-api) to get your API key for historical and forecast data.

## Deployment

AcreLedger is designed for Vercel or similar SPA hosting providers. Ensure the environment variables above are configured in your deployment platform.
