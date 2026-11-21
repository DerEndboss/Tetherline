import { content } from '../../content';
import { BlueprintLibrary } from './blueprint-store';

/** The device's saved blueprints (one library for the app; the tools panel and any palette tab share it). */
export const blueprintLibrary = new BlueprintLibrary((id) => content.buildings.find(id)?.size ?? 0);
