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

const LOCAL_IDENTITY: Identity = { key: "local", orbVerified: false, inWorldApp: false };

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
    const result = await MiniKit.walletAuth({
      nonce: makeNonce(),
      statement: "今日の水路をひらく",
    });
    const address = result.data?.address;
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

function storageKey(identity: Identity): string {
  return `water-channel:${identity.key}`;
}

export function hasPlayedToday(identity: Identity): boolean {
  try {
    return localStorage.getItem(storageKey(identity)) === dayKey();
  } catch {
    return false;
  }
}

export function markPlayedToday(identity: Identity): void {
  try {
    localStorage.setItem(storageKey(identity), dayKey());
  } catch {
    // Private mode and friends: the day simply won't be remembered.
  }
}
