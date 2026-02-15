import { detectMobileLike } from '../util/device';

export type QualityTier = 'high' | 'medium' | 'low';

/** Global mutable runtime state. Read by systems to branch on mobile/quality. */
export const GAME_MODE = {
  mobileMode: detectMobileLike(),
  quality: (detectMobileLike() ? 'medium' : 'high') as QualityTier,
};
