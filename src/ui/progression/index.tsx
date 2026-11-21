import { Effects } from './Effects';
import { Orders } from './Orders';
import { Radio } from './Radio';
import { Victory } from './Victory';

/** The progression module of the HUD: orders and radio (top right, left of the corner buttons; the guided tutorial lives in src/tutorial), notices, victory. */
export function ProgressionHud() {
  return (
    <>
      <div className="dock-orders">
        <Orders />
        <Radio />
      </div>
      <Effects />
      <Victory />
    </>
  );
}
