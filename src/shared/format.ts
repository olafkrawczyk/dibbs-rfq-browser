import type { Nsn, SolicitationNumber } from "./brand";

/** 8315016839267 → 8315-01-683-9267 */
export function formatNsn(nsn: Nsn): string {
  return `${nsn.slice(0, 4)}-${nsn.slice(4, 6)}-${nsn.slice(6, 9)}-${nsn.slice(9)}`;
}

/** SPE1C127Q0030 → SPE1C1-27-Q-0030 (DIBBS display form). */
export function formatSolicitation(sol: SolicitationNumber): string {
  if (sol.length !== 13) return sol;
  return `${sol.slice(0, 6)}-${sol.slice(6, 8)}-${sol.slice(8, 9)}-${sol.slice(9)}`;
}
