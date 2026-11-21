import type { CurrencyDef } from '../types';

export const currencies: CurrencyDef[] = [
  { id: 'credits', name: 'Credits', singular: 'Credit', keepsOnPrestige: false, color: '#ffc65c', icon: 'chip' },
  { id: 'research', name: 'Research', singular: 'Research', keepsOnPrestige: false, color: '#7fd4ff', icon: 'flask' },
  { id: 'prisms', name: 'Prisms', singular: 'Prism', keepsOnPrestige: true, color: '#d79bff', icon: 'prism' },
];
