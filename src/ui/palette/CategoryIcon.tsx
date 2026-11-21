import type { BuildCategory } from '../../content/types';
import { Icon, type IconName } from '../components/Icon';

const ICONS: Partial<Record<BuildCategory, IconName>> = {
  core: 'lander',
  mining: 'pick',
  logistics: 'arrow',
  power: 'bolt',
  factories: 'settings',
  mega: 'prism',
};

/** One small line icon per palette tab. Liquids has no shared icon yet, so its drop is drawn here. */
export function CategoryIcon({ id, size = 16 }: { id: BuildCategory; size?: number }) {
  const name = ICONS[id];
  if (name) return <Icon name={name} size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3.5c3.2 4.2 5.6 7 5.6 10.2a5.6 5.6 0 0 1-11.2 0c0-3.2 2.4-6 5.6-10.2Zm-2.4 10.8a2.6 2.6 0 0 0 2.4 2.1" />
    </svg>
  );
}
