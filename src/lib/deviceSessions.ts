// "Активні сеанси" in Profile/Settings — see schema.sql's
// user_sessions table comment for why this exists (Supabase Auth has
// no client-facing "list my sessions" API of its own).

import { supabase } from "./supabaseClient.ts";
import { parseUserAgent } from "../utils/userAgent.ts";
import { activeCutoffIso, HEARTBEAT_MS } from "../utils/deviceSessionsView.ts";

const DEVICE_ID_KEY = "sensoria_device_id";

// One random id per browser, generated once and kept in localStorage —
// this is what makes touchDeviceSession() an upsert instead of a new
// row every login.
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export type DeviceSession = {
  id: string;
  deviceId: string;
  label: string;
  lastSeenAt: string;
  isCurrentDevice: boolean;
};

// Fire-and-forget by design (called right after every successful
// login/boot) — a failed write here shouldn't block or fail the actual
// sign-in.
let heartbeatProfileId: string | null = null;
let lastTouch = 0;
let heartbeatInstalled = false;

export function touchDeviceSession(profileId: string): void {
  if (!supabase) return;
  heartbeatProfileId = profileId;
  lastTouch = Date.now();
  // One listener for the whole app: a tab that stays open keeps its own
  // "last seen" fresh whenever it becomes visible again (at most every 10 min).
  if (!heartbeatInstalled && typeof document !== "undefined") {
    heartbeatInstalled = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && heartbeatProfileId && Date.now() - lastTouch >= HEARTBEAT_MS) {
        touchDeviceSession(heartbeatProfileId);
      }
    });
  }
  supabase
    .from("user_sessions")
    .upsert(
      {
        profile_id: profileId,
        device_id: getDeviceId(),
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,device_id" }
    )
    .then(({ error }) => {
      if (error) {
        // eslint-disable-next-line no-console
        console.error("Не вдалося оновити активний сеанс:", error.message);
      }
    });
}

export async function fetchMyDeviceSessions(profileId: string, opts: { strict?: boolean } = {}): Promise<DeviceSession[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("user_sessions")
    .select("id, device_id, user_agent, last_seen_at")
    .eq("profile_id", profileId)
    .gte("last_seen_at", activeCutoffIso())
    .order("last_seen_at", { ascending: false });
  if (error && opts.strict) throw error;
  if (error || !data) return [];

  // Housekeeping: devices not seen within the window are no longer "active";
  // drop their rows so the table does not grow into a login history.
  supabase.from("user_sessions").delete().eq("profile_id", profileId).lt("last_seen_at", activeCutoffIso()).then(() => undefined);

  const currentDeviceId = getDeviceId();
  return data.map((row) => ({
    id: row.id,
    deviceId: row.device_id,
    label: parseUserAgent(row.user_agent),
    lastSeenAt: row.last_seen_at,
    isCurrentDevice: row.device_id === currentDeviceId,
  }));
}

// "Вийти з усіх інших пристроїв" — signOut({ scope: 'others' }) is the
// real enforcement (invalidates every other session's refresh token
// server-side); deleting the other rows here is just bookkeeping so
// this list stops showing them right away instead of waiting for them
// to go stale.
export async function signOutOtherDevices(profileId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) throw error;

  await supabase
    .from("user_sessions")
    .delete()
    .eq("profile_id", profileId)
    .neq("device_id", getDeviceId());
}

// Signing out on this device removes its own row right away (otherwise a
// device that logged out would stay in the list until it went stale).
export async function removeCurrentDeviceSession(): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("user_sessions").delete().eq("profile_id", user.id).eq("device_id", getDeviceId());
}
