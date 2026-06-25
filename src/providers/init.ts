import { ProviderRegistry } from "./registry";
import { slProvider } from "./slProvider";
import { sjostadProvider } from "./sjostadProvider";
import { createTransitService } from "../services/transitService";

/** Singleton provider registry, instantiated at module load.
 *  Import from main.ts to trigger initialisation.
 *  Providers register themselves before TransitService is used.
 */
export const providerRegistry = new ProviderRegistry();

// Register providers on init
providerRegistry.register(slProvider);
providerRegistry.register(sjostadProvider);

/** Singleton TransitService — single entry point for transit data.
 *  UI components and stores call this instead of direct slApi/staticTimetable.
 */
export const transitService = createTransitService(providerRegistry);
