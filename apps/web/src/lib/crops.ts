'use client';

import { cropFallback, type CropDto } from '@harvestslot/contracts';
import { useSession } from './session';

export type CropInfo = ReturnType<typeof cropFallback> & Partial<CropDto>;

/**
 * Crops come from the server (administrators manage them), never from a list in the code.
 * `list` = the crops farmers can choose now; `info(code)` also covers crops switched off since.
 */
export function useCrops(): { list: CropDto[]; info: (code: string) => CropInfo } {
  const { config } = useSession();
  const list = config?.crops ?? [];
  return { list, info: (code: string) => list.find((c) => c.code === code) ?? cropFallback(code) };
}
