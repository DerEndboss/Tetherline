import type { Price } from '../../sim/drones';
import { tip } from '../components/TipLayer';
import { GameIcon } from '../components/GameIcon';
import { useServices } from '../context';
import { formatShort } from '../format';
import type { World } from '../../sim/world';

interface Held {
  name: string;
  icon: string;
  color: string;
  have: number;
}

/** The material of a price entry and how much of it the core holds. */
function held(w: World, id: string): Held {
  const m = w.content.materials.find(id);
  return { name: m?.name ?? id, icon: m?.icon ?? '', color: m?.color ?? 'var(--color-muted)', have: m ? (w.state.stock[w.content.materials.indexOf(id)] ?? 0) : 0 };
}

/** One price entry: the item's icon, its name and the amount; short of it, the amount turns coral and shows what the core has. */
function CostItem({ price }: { price: Price }) {
  const { game } = useServices();
  const m = held(game.world, price.item);
  const short = m.have < price.n;
  const chip = <span className="item-chip" style={{ width: 18, height: 18, background: m.color }} aria-hidden="true" />;
  return (
    <li className={short ? 'dr-cost-item short' : 'dr-cost-item'} {...tip(`${m.name}: ${formatShort(m.have)} in the core, ${price.n} needed`)}>
      <GameIcon id={m.icon} size={22} fallback={chip} />
      <span className="dr-cost-text">
        <span className="dr-cost-name">{m.name}</span>
        <span className="num dr-cost-n">
          {short && <span className="dr-have">{formatShort(m.have)}/</span>}
          {price.n}
        </span>
      </span>
    </li>
  );
}

/** A price as lit item chips with the item's name (a bare icon told nobody what it was); the tooltip adds what the core holds. */
export function Cost({ price }: { price: Price[] }) {
  return (
    <ul className="dr-cost">
      {price.map((p) => (
        <CostItem key={p.item} price={p} />
      ))}
    </ul>
  );
}
