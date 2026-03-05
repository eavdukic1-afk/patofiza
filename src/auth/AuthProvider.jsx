import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

const STUDY_FLAG_KEY = "pf2_study_active";
const STUDY_STATE_EVENT = "pf2-study-state";

function readStudyActive() {
  try {
    return localStorage.getItem(STUDY_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

async function markOnline(userId) {
  if (!userId) return;
  await supabase
    .from("users")
    .update({ is_online: true, last_seen: new Date().toISOString() })
    .eq("id", userId);
}

async function markOffline(userId) {
  if (!userId) return;
  await supabase
    .from("users")
    .update({ is_online: false, last_seen: new Date().toISOString() })
    .eq("id", userId);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const [studyActive, setStudyActive] = useState(readStudyActive);
  const [showStudyPrompt, setShowStudyPrompt] = useState(false);
  const showPromptRef = useRef(false);
  const pendingPromptRef = useRef(false);
  const awayRef = useRef(false);
  const awayStartedAtRef = useRef(0);
  const timersRef = useRef({
    logout: null,
    studyPrompt: null,
    studyHardLogout: null,
    promptLogout: null,
  });

  const clearTimers = () => {
    const t = timersRef.current;
    if (t.logout) clearTimeout(t.logout);
    if (t.studyPrompt) clearTimeout(t.studyPrompt);
    if (t.studyHardLogout) clearTimeout(t.studyHardLogout);
    if (t.promptLogout) clearTimeout(t.promptLogout);
    timersRef.current = { logout: null, studyPrompt: null, studyHardLogout: null, promptLogout: null };
  };

  const closePrompt = () => {
    pendingPromptRef.current = false;
    setShowStudyPrompt(false);
    if (timersRef.current.promptLogout) {
      clearTimeout(timersRef.current.promptLogout);
      timersRef.current.promptLogout = null;
    }
  };

  useEffect(() => {
    showPromptRef.current = showStudyPrompt;
  }, [showStudyPrompt]);

  // Load initial session + listen for auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Listen for study state changes (Timer dispatches this)
  useEffect(() => {
    const sync = () => setStudyActive(readStudyActive());
    window.addEventListener(STUDY_STATE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(STUDY_STATE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Heartbeat: set online + update last_seen every 30s while logged in
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    markOnline(userId);

    const interval = setInterval(() => {
      markOnline(userId);
    }, 30000);

    // Try to mark offline if tab is closed/reloaded (best-effort)
    const onUnload = () => {
      // best-effort; may not always finish before tab closes
      navigator.sendBeacon?.(
        // no beacon endpoint here; so we just try a quick fetch alternative below
        ""
      );
      markOffline(userId);
    };

    window.addEventListener("beforeunload", onUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [session?.user?.id]);

  // Auto logout when user leaves the app:
  // - If NOT studying: logout after 2 min away
  // - If studying (started/paused): allow 45 min away, then show prompt; logout if no activity within 2 min
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    let alive = true;

    const signOutNow = async () => {
      if (!alive) return;
      clearTimers();
      closePrompt();
      awayRef.current = false;
      try {
        await markOffline(userId);
      } catch {
        // ignore
      }
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    };

    const openPrompt = () => {
      // Show the prompt and start 2-min inactivity timer
      setShowStudyPrompt(true);
      pendingPromptRef.current = false;
      if (timersRef.current.promptLogout) clearTimeout(timersRef.current.promptLogout);
      timersRef.current.promptLogout = setTimeout(() => {
        signOutNow();
      }, 2 * 60 * 1000);
    };

    const onActivity = () => {
      if (showPromptRef.current) {
        // Any activity within 2 minutes counts as "still studying"
        closePrompt();
      }
    };

    const startAwayTimers = () => {
      clearTimers();
      const studying = readStudyActive();

      if (!studying) {
        timersRef.current.logout = setTimeout(() => {
          signOutNow();
        }, 2 * 60 * 1000);
        return;
      }

      // Studying: allow 45 min away
      timersRef.current.studyPrompt = setTimeout(() => {
        pendingPromptRef.current = true;
        if (!document.hidden) openPrompt();
      }, 45 * 60 * 1000);

      // If they never come back, force logout after 45+2 minutes
      timersRef.current.studyHardLogout = setTimeout(() => {
        signOutNow();
      }, 47 * 60 * 1000);
    };

    const onAway = () => {
      if (awayRef.current) return;
      awayRef.current = true;
      awayStartedAtRef.current = Date.now();
      closePrompt();
      startAwayTimers();
    };

    const onReturn = () => {
      if (!awayRef.current) return;
      awayRef.current = false;

      const delta = Date.now() - (awayStartedAtRef.current || Date.now());
      const studying = readStudyActive();

      // Handle cases where the browser/device paused JS timers (sleep/lock)
      if (!studying) {
        if (delta >= 2 * 60 * 1000) {
          signOutNow();
          return;
        }
      } else {
        if (delta >= 47 * 60 * 1000) {
          signOutNow();
          return;
        }
        if (delta >= 45 * 60 * 1000) {
          clearTimers();
          openPrompt();
          return;
        }
      }

      clearTimers();

      // If they were away longer than 45 min while studying, show the prompt now
      if (pendingPromptRef.current) {
        openPrompt();
      }
    };

    const onVisibility = () => {
      if (document.hidden) onAway();
      else onReturn();
    };

    const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    window.addEventListener("blur", onAway);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      clearTimers();
      activityEvents.forEach((ev) => window.removeEventListener(ev, onActivity));
      window.removeEventListener("blur", onAway);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session?.user?.id]);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, loading, studyActive }),
    [session, loading, studyActive]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {showStudyPrompt && (
        <div style={promptOverlayStyle}>
          <div style={promptCardStyle}>
            <div style={promptTitleStyle}>Are you still studying?</div>
            <div style={promptHintStyle}>
              If you are not active in the next 2 minutes, you will be logged out.
            </div>
            <div style={promptBtnRowStyle}>
              <button
                onClick={() => {
                  closePrompt();
                }}
                style={{ ...promptBtnStyle, ...promptBtnPrimaryStyle }}
              >
                Yes
              </button>
              <button
                onClick={() => {
                  closePrompt();
                  const uid = session?.user?.id;
                  if (uid) markOffline(uid);
                  supabase.auth.signOut();
                }}
                style={{ ...promptBtnStyle, ...promptBtnDangerStyle }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Export helpers so Login/Logout can set online/offline immediately
export { markOnline, markOffline };

const promptOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.38)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
  padding: 18,
};

const promptCardStyle = {
  width: "min(520px, 92vw)",
  borderRadius: 18,
  background: "rgba(255,255,255,0.98)",
  border: "1px solid rgba(17,24,39,0.10)",
  boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
  padding: 18,
  fontFamily: "Arial, sans-serif",
};

const promptTitleStyle = {
  fontSize: 18,
  fontWeight: 900,
  color: "#0B1220",
  letterSpacing: -0.2,
};

const promptHintStyle = {
  marginTop: 8,
  fontSize: 13,
  fontWeight: 800,
  color: "rgba(11,18,32,0.72)",
  lineHeight: 1.35,
};

const promptBtnRowStyle = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  marginTop: 14,
  flexWrap: "wrap",
};

const promptBtnStyle = {
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.14)",
  fontFamily: "Arial, sans-serif",
  fontWeight: 900,
  letterSpacing: 0.2,
  fontSize: 14,
  padding: "10px 14px",
  minWidth: 120,
  cursor: "pointer",
};

const promptBtnPrimaryStyle = {
  background: "#0B1220",
  color: "white",
};

const promptBtnDangerStyle = {
  background: "#B91C1C",
  color: "white",
  border: "1px solid rgba(185, 28, 28, 0.35)",
};