// Lifts any tx error thrown by @coral-xyz/anchor / wallet-adapter into a
// single user-friendly string. Prefers the typed AnchorError.code path and
// falls back to string inspection for wallet-wrapped messages.

interface MaybeAnchorError {
  error?: {
    errorCode?: { code?: string; number?: number };
    errorMessage?: string;
  };
  message?: string;
  logs?: string[];
}

// Our own program's custom error enum — see programs/forexforsoul/src/errors.rs.
const PROGRAM_ERRORS: Record<string, string> = {
  InvalidAuthority: 'Unauthorized action.',
  InsufficientCollateral: 'Collateral too low (rounding). Lower leverage or increase notional.',
  ExcessiveLeverage: 'Leverage exceeds the pair limit.',
  PositionNotFound: 'Position account missing — already closed?',
  Unauthorized: 'This wallet does not own the position.',
  OracleStale: 'Oracle price is stale — wait for the crank tick.',
  PairNotActive: 'Trading pair is currently disabled.',
  ExchangePaused: 'Exchange is paused by admin.',
  MathOverflow: 'Math overflow — unusual value range.',
  PositionHealthy: 'Position still healthy; cannot liquidate.',
  PoolEmpty: 'LP pool is empty.',
  InsufficientShares: 'Insufficient LP shares.',
};

// Custom program error codes (first 3) from `anchor build` — match errors.rs order.
const PROGRAM_ERROR_CODES: Record<number, keyof typeof PROGRAM_ERRORS> = {
  0x1770: 'InvalidAuthority',
  0x1771: 'OracleStale',
  0x1772: 'ExcessiveLeverage',
  0x1773: 'PositionNotFound',
  0x1774: 'InsufficientCollateral',
  0x1775: 'Unauthorized',
  0x1776: 'PairNotActive',
  0x1777: 'MathOverflow',
  0x1778: 'PositionHealthy',
  0x1779: 'PoolEmpty',
  0x177a: 'InsufficientShares',
  0x177b: 'ExchangePaused',
};

export function friendlyTxError(exc: unknown): string {
  const e = exc as MaybeAnchorError;
  const code = e?.error?.errorCode?.code;
  if (code && PROGRAM_ERRORS[code]) return PROGRAM_ERRORS[code];
  if (e?.error?.errorMessage) return e.error.errorMessage;

  const raw = String((e && e.message) ?? exc ?? '').replace(/^Error:\s*/, '');

  // Wallet-level messages:
  if (/user rejected|rejected.*request/i.test(raw)) return 'Transaction rejected by wallet.';
  if (/insufficient\s+lamports|insufficient\s+funds/i.test(raw)) return 'Wallet SOL balance too low for this trade.';
  if (/Unknown action/.test(raw)) return 'Wallet couldn\u2019t parse the program error. Likely stale price or bad collateral rounding.';

  // Hex custom-program errors the wallet surfaces.
  const hex = raw.match(/custom program error: (0x[0-9a-fA-F]+)/);
  if (hex) {
    const num = Number.parseInt(hex[1], 16);
    const name = PROGRAM_ERROR_CODES[num];
    if (name && PROGRAM_ERRORS[name]) return PROGRAM_ERRORS[name];
    return `Program error ${hex[1]}.`;
  }

  // Search logs for anchor panic lines.
  const log = e?.logs?.find((l) => /AnchorError/.test(l));
  if (log) {
    const m = log.match(/Error Code: (\w+)/);
    if (m && PROGRAM_ERRORS[m[1]]) return PROGRAM_ERRORS[m[1]];
  }

  return raw.length > 160 ? raw.slice(0, 157) + '\u2026' : raw || 'Unknown error.';
}
