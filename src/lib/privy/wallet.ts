import type { User, WalletWithMetadata } from "@privy-io/react-auth";

/** Privy server wallet id from linked embedded wallet accounts. */
export function privyWalletIdForAddress(
  user: User | null,
  address: string,
): string | undefined {
  if (!user) return undefined;
  const normalized = address.toLowerCase();
  for (const account of user.linkedAccounts) {
    if (account.type !== "wallet") continue;
    const wallet = account as WalletWithMetadata;
    if (wallet.address.toLowerCase() !== normalized) continue;
    if (wallet.walletClientType !== "privy" && wallet.walletClientType !== "privy-v2") {
      continue;
    }
    return wallet.id ?? undefined;
  }
  return undefined;
}

export function embeddedPrivyWallet(user: User | null, address: string) {
  const normalized = address.toLowerCase();
  for (const account of user?.linkedAccounts ?? []) {
    if (account.type !== "wallet") continue;
    const wallet = account as WalletWithMetadata;
    if (wallet.address.toLowerCase() !== normalized) continue;
    if (wallet.walletClientType !== "privy" && wallet.walletClientType !== "privy-v2") {
      continue;
    }
    return wallet;
  }
  return undefined;
}

/** Embedded Privy wallet with an active session signer (delegated). */
export function delegatedPrivyWallet(user: User | null) {
  for (const account of user?.linkedAccounts ?? []) {
    if (account.type !== "wallet") continue;
    const wallet = account as WalletWithMetadata;
    if (!wallet.delegated) continue;
    if (wallet.walletClientType !== "privy" && wallet.walletClientType !== "privy-v2") {
      continue;
    }
    return wallet;
  }
  return undefined;
}
