export function creatorPath(id: string) {
  return `/creators/${encodeURIComponent(id)}`;
}

export function isCreatorWallet(id: string) {
  return /^0x[a-fA-F0-9]{40}$/i.test(id);
}
