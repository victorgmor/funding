import { useEffect, useRef, useState, type MouseEvent } from "react";
import { FloatingPortal } from "@floating-ui/react";
import CreatorAvatar from "@/components/creators/CreatorAvatar";
import {
  readLocalProfile,
  writeLocalProfile,
} from "@/lib/local-profile";

type Props = {
  open: boolean;
  address: `0x${string}`;
  onClose: () => void;
};

const BIO_MAX = 160;
const shell =
  "w-full max-w-md overflow-hidden rounded-2xl bg-[#181709] text-white shadow-[0px_0px_40px_-8px_rgba(0,0,0,0.45)]";
const field =
  "w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none";
const labelClass = "mb-1.5 block text-sm font-medium text-white/80";

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export default function EditProfileModal({
  open,
  address,
  onClose,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [polyImage, setPolyImage] = useState<string | null>(null);
  const [polyName, setPolyName] = useState<string | null>(null);

  const displayWallet = address;

  useEffect(() => {
    if (!open) return;
    const local = readLocalProfile(address);
    setUsername(local?.username ?? "");
    setBio(local?.bio ?? "");
    setAvatar(local?.avatarDataUrl ?? null);

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/managers/${encodeURIComponent(address)}`,
        );
        const data = (await res.json()) as {
          username?: string;
          bio?: string;
          avatarUrl?: string | null;
          polymarketName?: string | null;
          name?: string | null;
          proxyWallet?: string | null;
        };
        if (cancelled || !res.ok) return;
        setPolyName(data.polymarketName ?? data.name ?? null);
        if (data.avatarUrl) setPolyImage(data.avatarUrl);
        if (!local?.username && data.username) setUsername(data.username);
        else if (!local?.username && data.proxyWallet) {
          setUsername(data.proxyWallet);
        }
        if (!local?.bio && data.bio) setBio(data.bio);
        if (!local?.avatarDataUrl && data.avatarUrl) {
          setAvatar(data.avatarUrl);
        }
      } catch {
        // keep local / empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, address]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function onPickAvatar(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 350_000) {
      // ponytail: DynamoDB item size budget for avatar data URLs
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setAvatar(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    const profile = {
      username: username.trim(),
      bio: bio.slice(0, BIO_MAX),
      avatarDataUrl: avatar,
    };
    writeLocalProfile(address, profile);
    try {
      await fetch(`/api/managers/${encodeURIComponent(address)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: profile.username,
          bio: profile.bio,
          avatarUrl: profile.avatarDataUrl,
        }),
      });
    } catch {
      // local cache still updated
    }
    onClose();
  }

  async function copyWallet(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    await copyText(displayWallet);
    setCopied(true);
  }

  const previewAvatar = avatar || polyImage;

  return (
    <FloatingPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-profile-title"
          className={shell}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/25 px-2.5 py-0.5 text-xs font-medium text-white/90">
                  Edit
                </span>
                <h2
                  id="edit-profile-title"
                  className="text-base font-semibold text-white"
                >
                  Your Profile
                </h2>
              </div>
              <p className="mt-2 text-sm text-white/50">
                Change your name, avatar, or keep your profile up to date.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-5 px-5 py-5">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <span className="text-sm text-white/55">Wallet Address:</span>
              <div className="flex min-w-0 items-center gap-2">
                <CreatorAvatar
                  address={address}
                  name={username || polyName || address}
                  initialImage={previewAvatar}
                  size="2xs"
                  className="ring-1 ring-white/25"
                />
                <span
                  className="truncate font-mono text-sm text-white"
                  title={displayWallet}
                >
                  {shortAddress(displayWallet)}
                </span>
                <button
                  type="button"
                  onClick={(event) => void copyWallet(event)}
                  className="text-white/50 transition-colors hover:text-white"
                  aria-label={copied ? "Copied" : "Copy address"}
                >
                  {copied ? "✓" : "⧉"}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <CreatorAvatar
                address={address}
                name={username || polyName || address}
                initialImage={previewAvatar}
                size="md"
                className="ring-1 ring-white/15"
              />
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => onPickAvatar(event.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-full border border-white/25 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                >
                  Change Avatar
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="profile-username">
                Username
              </label>
              <input
                id="profile-username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={polyName ?? "Polymarket wallet address"}
                maxLength={42}
                className={field}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="profile-bio">
                Bio
              </label>
              <div className="relative">
                <textarea
                  id="profile-bio"
                  value={bio}
                  onChange={(event) =>
                    setBio(event.target.value.slice(0, BIO_MAX))
                  }
                  placeholder="Tell people a bit about yourself…"
                  rows={3}
                  className={`${field} resize-none pr-14`}
                />
                <span className="pointer-events-none absolute right-3 bottom-2.5 text-xs text-white/35">
                  {bio.length}/{BIO_MAX}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 border-t border-white/10 px-5 py-4">
            <button
              type="button"
              onClick={save}
              className="bg-accent text-secondary flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-white/25 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </FloatingPortal>
  );
}
