import { Map as MapIcon, Wheat, ClipboardList, FileText, Settings } from 'lucide-react';

export const navTabs = [
  { path: '/', icon: MapIcon, label: 'Fields' },
  { path: '/logistics', icon: Wheat, label: 'Storage' },
  { path: '/activity', icon: ClipboardList, label: 'Activity' },
  { path: '/reports', icon: FileText, label: 'Reports' },
  { path: '/settings', icon: Settings, label: 'Setup' },
];
