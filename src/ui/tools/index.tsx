import { ToolBar } from './ToolBar';

/** The tools module of the HUD: tool hints and the stop button (above the palette). */
export function ToolsHud() {
  return (
    <div className="dock-tools">
      <ToolBar />
    </div>
  );
}
