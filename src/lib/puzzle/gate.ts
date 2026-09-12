"use client";

import { MiniKit } from "@worldcoin/minikit-js";
import { isInWorldApp } from "@worldcoin/minikit-js/commands";
import { dayKey } from "./random";

// MiniKit v2 no longer ships a World ID `verify` command (those flows moved
// to IDKit, which needs a server to check the proof). What World App does
// expose here is walletAuth — a real, user-approved command that returns the
// account's address — plus the account's World ID verification status. The
// address is the per-person key for "one run per day"; the status tells us
// whether that person is a verified human.
//
// Without a backend the signature is not checked, so this is an identity
// key, not a security boundary: someone determined to replay the day can
// still clear their storage. Closing that hole needs the server tier.

export type Identity = {
  /** Storage key for the day gate — the wallet address when we have one. */
  key: string;
  orbVerified: boolean;
  inWorldApp: boolean;
};

const LOCAL_KEY = "local";
const LOCAL_IDENTITY: Identity = { key: LOCAL_KEY, orbVerified: false, inWorldApp: false };

// Never let an unanswered sheet strand the app: if World App doesn't come
// back, we carry on as an anonymous local player.
const AUTH_TIMEOUT_MS = 8000;

function makeNonce(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now()}${Math.floor(Math.random() * 1e8)}`;
  }
}

export async function resolveIdentity(): Promise<Identity> {
  if (typeof window === "undefined") return LOCAL_IDENTITY;
  try {
    if (!isInWorldApp()) return LOCAL_IDENTITY;
    const auth = MiniKit.walletAuth({
      nonce: makeNonce(),
      statement: "今日の水路をひらく",
    });
    const timeout = new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), AUTH_TIMEOUT_MS);
    });
    const result = await Promise.race([auth, timeout]);
    const address = result?.data?.address;
    if (!address) return LOCAL_IDENTITY;
    return {
      key: address.toLowerCase(),
      orbVerified: MiniKit.user?.verificationStatus?.isOrbVerified ?? false,
      inWorldApp: true,
    };
  } catch {
    // Declined or unavailable: still let them play, just keyed locally.
    return LOCAL_IDENTITY;
  }
}

function storageKey(key: string): string {
  return `water-channel:${key}`;
}

function readDay(key: string): string | null {
  try {
    return localStorage.getItem(storageKey(key));
  } catch {
    return null;
  }
}

/**
 * The local key answers instantly at launch, so the app never waits on a
 * sheet to decide what to show. A wallet key is written alongside it so a
 * shared device still gives each person their own run.
 */
export function hasPlayedToday(identity?: Identity | null): boolean {
  const today = dayKey();
  if (readDay(LOCAL_KEY) === today) return true;
  return identity ? readDay(identity.key) === today : false;
}

const DAYS_KEY = "water-channel:days";

/** How many days this person has opened the channel — the breath grows with it. */
export function daysCompleted(): number {
  try {
    const raw = localStorage.getItem(DAYS_KEY);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function markPlayedToday(identity?: Identity | null): void {
  const today = dayKey();
  // Only a day's first run counts. Running it again is for the pleasure of
  // it and must not inflate the streak the breath is paced from.
  const firstRunToday = !hasPlayedToday(identity);
  try {
    localStorage.setItem(storageKey(LOCAL_KEY), today);
    if (identity && identity.key !== LOCAL_KEY) {
      localStorage.setItem(storageKey(identity.key), today);
    }
    if (firstRunToday) localStorage.setItem(DAYS_KEY, String(daysCompleted() + 1));
  } catch {
    // Private mode and friends: the day simply won't be remembered.
  }
}
