import type {
  ConnectedWallet,
  User,
  WalletWithMetadata,
} from "@privy-io/react-auth";

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

/** Only expose the Privy embedded wallet to wagmi (never Phantom / injected). */
export function embeddedWalletForWagmi({
  wallets,
}: {
  wallets: ConnectedWallet[];
  user: User | null;
}): ConnectedWallet | undefined {
  return wallets.find(
    (w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2",
  );
}

export function isEmbeddedPrivyAddress(user: User | null, address: string) {
  return !!embeddedPrivyWallet(user, address);
}
