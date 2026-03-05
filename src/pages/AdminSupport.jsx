import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { useAuth, markOffline } from "../auth/AuthProvider";
import logoMed from "../assets/logo_medicinski_fakultet.jpg";

/**
 * AdminSupport (/admin/support)
 *
 * Mobile behavior matches Kontakt.jsx:
 * - Mobile portrait: hamburger-like button with dropdown + blurred backdrop
 * - Threads + chat stack vertically on mobile
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function NavLink({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      type="button"
      style={navLinkStyle}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(17,24,39,0.06)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </button>
  );
}

function MenuItem({ label, onClick, danger = false }) {
  const baseBg = danger ? "#B91C1C" : "transparent";
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        ...mobileMenuItemStyle,
        ...(danger
          ? {
              color: "#FFFFFF",
              background: baseBg,
              borderColor: "rgba(185, 28, 28, 0.45)",
              boxShadow: "0 12px 26px rgba(185,28,28,0.25)",
            }
          : null),
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? "#A21616" : "rgba(17,24,39,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = baseBg;
      }}
    >
      {label}
    </button>
  );
}

export default function AdminSupport() {
  const { user } = useAuth();
  const nav = useNavigate();

  // Mobile template (Kontakt.jsx)
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);

  const [adminProfile, setAdminProfile] = useState(null);

  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const [threads, setThreads] = useState([]); // {user_id, last_at, last_message, first_name, username}
  const [selectedUserId, setSelectedUserId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const listRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px) and (orientation: portrait)");
    const apply = () => setIsMobilePortrait(!!mq.matches);
    apply();

    if (mq.addEventListener) mq.addEventListener("change", apply);
    else mq.addListener(apply);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else mq.removeListener(apply);
    };
  }, []);

  useEffect(() => {
    if (!isMobilePortrait) setIsMenuOpen(false);
  }, [isMobilePortrait]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Load admin profile (for greeting)
  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      const { data } = await supabase
        .from("users")
        .select("id,role,first_name,gender")
        .eq("id", user.id)
        .single();
      setAdminProfile(data ?? null);
    }
    loadProfile();
  }, [user?.id]);

  async function logout() {
    if (!user) return;
    await markOffline(user.id);
    await supabase.auth.signOut();
    nav("/login");
  }

  function go(path) {
    setIsMenuOpen(false);
    nav(path);
  }

  // Threads loader (build list of conversations by latest message)
  async function loadThreads() {
    if (!user) return;
    setLoadingThreads(true);
    setErrMsg("");

    try {
      // Pull last N messages and aggregate client-side
      const { data, error } = await supabase
        .from("support_messages")
        .select("user_id,created_at,message,users:user_id(first_name,username)")
        .order("created_at", { ascending: false })
        .limit(800);

      if (error) throw error;

      const map = new Map();
      (data ?? []).forEach((m) => {
        if (!map.has(m.user_id)) {
          map.set(m.user_id, {
            user_id: m.user_id,
            last_at: m.created_at,
            last_message: m.message,
            first_name: m.users?.first_name ?? "",
            username: m.users?.username ?? "",
          });
        }
      });

      const arr = Array.from(map.values()).sort(
        (a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime()
      );

      setThreads(arr);
      if (!selectedUserId && arr.length) setSelectedUserId(arr[0].user_id);
      if (selectedUserId && !arr.some((t) => t.user_id === selectedUserId) && arr.length) {
        setSelectedUserId(arr[0].user_id);
      }
    } catch (e) {
      setErrMsg(e.message || "Greška pri učitavanju razgovora.");
    } finally {
      setLoadingThreads(false);
    }
  }

  // Conversation loader
  async function loadConversation(userId) {
    if (!user || !userId) return;
    setLoadingMessages(true);
    setErrMsg("");

    try {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id,created_at,user_id,sender_role,message")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data ?? []);
    } catch (e) {
      setErrMsg(e.message || "Greška pri učitavanju poruka.");
    } finally {
      setLoadingMessages(false);
    }
  }

  // Initial load + realtime for threads list
  useEffect(() => {
    if (!user) return;

    loadThreads();

    const channel = supabase
      .channel("support_messages_admin_threads")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_messages" },
        () => loadThreads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Load selected conversation + realtime for that conversation
  useEffect(() => {
    if (!user || !selectedUserId) return;

    loadConversation(selectedUserId);

    const channel = supabase
      .channel(`support_messages_admin_${selectedUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_messages",
          filter: `user_id=eq.${selectedUserId}`,
        },
        () => loadConversation(selectedUserId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedUserId]);

  // Auto scroll to bottom
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages?.length, loadingMessages]);

  const greetingWord = adminProfile?.gender === "female" ? "Dobrodošla" : "Dobrodošao";
  const firstName = adminProfile?.first_name || "Admin";
  const greeting = `${greetingWord}, ${firstName}!`;

  const selectedThread = useMemo(
    () => threads.find((t) => t.user_id === selectedUserId),
    [threads, selectedUserId]
  );

  async function sendReply() {
    const text = draft.trim();
    if (!text || sending || !selectedUserId) return;

    setSending(true);
    setErrMsg("");

    try {
      const { error } = await supabase.from("support_messages").insert([
        { user_id: selectedUserId, sender_role: "admin", message: text },
      ]);

      if (error) throw error;

      setDraft("");
    } catch (e) {
      setErrMsg(e.message || "Greška pri slanju odgovora.");
    } finally {
      setSending(false);
    }
  }

  if (!user) {
    return (
      <div style={pageStyle}>
        <div style={frameStyle}>
          <div style={panelStyle}>
            <div style={contentWrapStyle}>
              <div style={cardStyle}>
                <div style={titleStyle}>Admin inbox</div>
                <div style={subtitleStyle}>Niste prijavljeni.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const responsiveLayout = isMobilePortrait ? layoutStyleMobile : layoutStyle;

  return (
    <div style={{ position: "relative" }}>
      <div style={pageStyle}>
        <div style={frameStyle}>
          <div style={panelStyle}>
            {/* NAVIGATION */}
            {!isMobilePortrait ? (
              <div style={topNavStyle}>
                <div style={brandStyle}>
                  <img src={logoMed} alt="Medicinski fakultet" style={brandLogoStyle} />
                  <div style={{ lineHeight: 1.1 }}>
                    <div style={brandTitleStyle}>Admin</div>
                    <div style={brandSubtitleStyle}>{greeting}</div>
                  </div>
                </div>

                <div style={navLinksRowStyle}>
                  <NavLink label="Početna stranica" onClick={() => nav("/admin")} />
                  <NavLink label="Korisnici" onClick={() => nav("/admin/users")} />
                  <NavLink label="Korisnička podrška" onClick={() => nav("/admin/support")} />
                </div>

                <button onClick={logout} style={logoutBtnStyle}>
                  Odjavite se
                </button>
              </div>
            ) : (
              <div style={mobileHeaderWrapStyle}>
                <div style={{ position: "relative" }}>
                  <button
                    ref={menuBtnRef}
                    type="button"
                    onClick={() => setIsMenuOpen((v) => !v)}
                    style={mobileMenuButtonStyle}
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                  >
                    <img src={logoMed} alt="Medicinski fakultet" style={brandLogoMobileStyle} />

                    <div style={{ minWidth: 0, textAlign: "left" }}>
                      <div style={mobileMenuTitleStyle}>Admin</div>
                      <div style={mobileMenuSubRowStyle}>
                        <span style={mobileMenuSubStyle}>{greetingWord},</span>
                        <span style={mobileMenuNameStyle}>{firstName}</span>
                      </div>
                    </div>

                    <div style={mobileCaretWrapStyle} aria-hidden="true">
                      {isMenuOpen ? "▲" : "▼"}
                    </div>
                  </button>

                  {isMenuOpen && (
                    <div style={mobileDropdownStyle} role="menu">
                      <MenuItem label="Početna stranica" onClick={() => go("/admin")} />
                      <MenuItem label="Korisnici" onClick={() => go("/admin/users")} />
                      <MenuItem label="Korisnička podrška" onClick={() => go("/admin/support")} />
                      <div style={menuDividerStyle} />
                      <MenuItem
                        label="Odjavite se"
                        danger
                        onClick={async () => {
                          setIsMenuOpen(false);
                          await logout();
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CONTENT */}
            <div style={contentWrapStyle}>
              <div style={cardStyle}>
                <div style={headerRowStyle}>
                  <div>
                    <div style={eyebrowStyle}>Podrška</div>
                    <div style={titleStyle}>Admin inbox</div>
                    <div style={subtitleStyle}>
                      Odaberite korisnika {isMobilePortrait ? "ispod" : "lijevo"} i odgovorite na poruke.
                    </div>
                  </div>
                </div>

                {errMsg && <div style={errorStyle}>{errMsg}</div>}

                <div style={responsiveLayout}>
                  {/* Threads list */}
                  <div style={threadsStyle}>
                    <div style={threadsTopRowStyle}>
                      <div style={threadsTitleStyle}>Razgovori</div>
                      <button
                        type="button"
                        style={refreshBtnStyle}
                        onClick={loadThreads}
                        disabled={loadingThreads}
                        title="Osvježi"
                      >
                        {loadingThreads ? "…" : "↻"}
                      </button>
                    </div>

                    {loadingThreads ? (
                      <div style={loadingInlineStyle}>Učitavanje…</div>
                    ) : threads.length ? (
                      threads.map((t) => {
                        const active = t.user_id === selectedUserId;
                        const label =
                          t.first_name?.trim() ||
                          t.username?.trim() ||
                          `${t.user_id.slice(0, 8)}…`;

                        return (
                          <button
                            key={t.user_id}
                            type="button"
                            onClick={() => setSelectedUserId(t.user_id)}
                            style={{
                              ...threadItemStyle,
                              ...(active ? threadItemActiveStyle : null),
                            }}
                          >
                            <div style={threadTopStyle}>
                              <div style={threadNameStyle}>{label}</div>
                              <div style={threadTimeStyle}>{formatTime(t.last_at)}</div>
                            </div>
                            <div style={threadPreviewStyle}>{t.last_message}</div>
                            <div style={threadMetaStyle}>{formatDateTime(t.last_at)}</div>
                          </button>
                        );
                      })
                    ) : (
                      <div style={emptyThreadsStyle}>Nema poruka.</div>
                    )}
                  </div>

                  {/* Conversation */}
                  <div
                    style={{
                      ...chatShellStyle,
                      minHeight: isMobilePortrait ? 460 : chatShellStyle.minHeight,
                    }}
                  >
                    <div style={chatHeaderStyle}>
                      <div style={chatDotStyle} />
                      <div style={chatHeaderTextStyle}>
                        {selectedThread
                          ? `Korisnik: ${
                              selectedThread.first_name || selectedThread.username || selectedUserId
                            }`
                          : "Odaberite razgovor"}
                      </div>
                      <div style={chatHeaderBadgeStyle}>Inbox</div>
                    </div>

                    <div style={chatBodyStyle} ref={listRef}>
                      {loadingMessages ? (
                        <div style={loadingInlineStyle}>Učitavanje…</div>
                      ) : selectedUserId ? (
                        messages?.length ? (
                          messages.map((m) => {
                            const isAdmin = m.sender_role === "admin";
                            return (
                              <div
                                key={m.id}
                                style={isAdmin ? bubbleRightWrapStyle : bubbleLeftWrapStyle}
                              >
                                <div style={isAdmin ? bubbleRightStyle : bubbleLeftStyle}>
                                  <div style={bubbleTextStyle}>{m.message}</div>
                                  <div style={bubbleMetaStyle}>{formatTime(m.created_at)}</div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div style={emptyStyle}>Nema poruka u ovom razgovoru.</div>
                        )
                      ) : (
                        <div style={emptyStyle}>
                          {isMobilePortrait ? "Odaberite razgovor gore." : "Odaberite razgovor lijevo."}
                        </div>
                      )}
                    </div>

                    <div style={chatComposerStyle}>
                      <div style={fieldStyle}>
                        <div style={labelStyle}>Odgovor</div>
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder="Napišite odgovor…"
                          style={textareaStyle}
                          rows={4}
                          disabled={!selectedUserId}
                        />
                      </div>

                      <div style={sendRowStyle}>
                        <div style={hintStyle}>
                          {selectedUserId
                            ? "Odgovor će se pojaviti korisniku u Kontakt inboxu."
                            : "Odaberite razgovor."}
                        </div>

                        <button
                          type="button"
                          onClick={sendReply}
                          disabled={sending || !draft.trim() || !selectedUserId}
                          style={{
                            ...sendBtnStyle,
                            opacity: sending || !draft.trim() || !selectedUserId ? 0.55 : 1,
                            cursor:
                              sending || !draft.trim() || !selectedUserId
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          {sending ? "Šaljem…" : "Pošalji"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile blur backdrop */}
      {isMobilePortrait && isMenuOpen && (
        <div style={menuBackdropStyle} onClick={() => setIsMenuOpen(false)} aria-hidden="true" />
      )}
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 100%)",
  padding: 28,
  fontFamily: "Arial, sans-serif",
};

const frameStyle = {
  maxWidth: 1160,
  margin: "0 auto",
  padding: 14,
  borderRadius: 26,
  background: "rgba(255,255,255,0.95)",
  boxShadow: "0 26px 80px rgba(0,0,0,0.18)",
};

const panelStyle = {
  minHeight: "calc(100vh - 84px)",
  borderRadius: 18,
  background: "#2DBD6E",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const topNavStyle = {
  position: "sticky",
  top: 14,
  zIndex: 2,
  background: "rgba(255,255,255,0.98)",
  borderRadius: 14,
  margin: 14,
  padding: "12px 14px",
  display: "flex",
  alignItems: "center",
  gap: 12,
  boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
};

const brandStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 220,
};

const brandLogoStyle = {
  width: 34,
  height: 34,
  borderRadius: 10,
  objectFit: "cover",
  background: "white",
  border: "1px solid rgba(17,24,39,0.10)",
  boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
  flex: "0 0 auto",
};

const brandTitleStyle = {
  fontSize: 13,
  fontWeight: 800,
  color: "#0B1220",
  letterSpacing: 0.2,
};

const brandSubtitleStyle = {
  fontSize: 12,
  color: "rgba(17,24,39,0.78)",
  fontWeight: 600,
  marginTop: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 260,
};

const navLinksRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flex: 1,
  justifyContent: "flex-start",
  flexWrap: "wrap",
};

const navLinkStyle = {
  border: "1px solid transparent",
  background: "transparent",
  padding: "10px 12px",
  borderRadius: 10,
  fontWeight: 700,
  color: "#0B1220",
  cursor: "pointer",
};

const logoutBtnStyle = {
  border: "1px solid rgba(185, 28, 28, 0.35)",
  background: "#B91C1C",
  color: "white",
  padding: "10px 14px",
  borderRadius: 12,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 12px 26px rgba(185,28,28,0.25)",
  whiteSpace: "nowrap",
};

const contentWrapStyle = {
  flex: 1,
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
  padding: "18px 18px 20px",
};

const cardStyle = {
  width: "100%",
  maxWidth: 1040,
  background: "rgba(255,255,255,0.92)",
  borderRadius: 20,
  border: "1px solid rgba(17,24,39,0.08)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
  padding: "18px 18px 16px",
};

const headerRowStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const eyebrowStyle = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(45,189,110,0.14)",
  border: "1px solid rgba(45,189,110,0.24)",
  color: "rgba(11,18,32,0.86)",
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: 0.2,
};

const titleStyle = {
  marginTop: 8,
  fontSize: 34,
  letterSpacing: -0.4,
  color: "#0B1220",
  fontWeight: 900,
};

const subtitleStyle = {
  marginTop: 6,
  fontSize: 13,
  fontWeight: 800,
  color: "rgba(11,18,32,0.74)",
  maxWidth: 680,
};

const errorStyle = {
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(185,28,28,0.25)",
  background: "rgba(185,28,28,0.08)",
  color: "#7F1D1D",
  fontWeight: 900,
};

const noteStyle = {
  marginTop: 14,
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(45,189,110,0.10)",
  color: "rgba(11,18,32,0.78)",
  fontWeight: 800,
  fontSize: 12,
};

const layoutStyle = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "320px 1fr",
  gap: 12,
};

const threadsStyle = {
  borderRadius: 18,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.12)",
  padding: 12,
  overflow: "hidden",
};

const threadsTopRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
};

const threadsTitleStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.70)",
};

const refreshBtnStyle = {
  width: 34,
  height: 34,
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.12)",
  background: "rgba(255,255,255,0.92)",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
};

const threadItemStyle = {
  width: "100%",
  textAlign: "left",
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.08)",
  background: "rgba(255,255,255,0.98)",
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
  marginBottom: 10,
};

const threadItemActiveStyle = {
  borderColor: "rgba(45,189,110,0.35)",
  background: "rgba(45,189,110,0.10)",
};

const threadTopStyle = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
};

const threadNameStyle = {
  fontWeight: 900,
  color: "#0B1220",
  fontSize: 13,
};

const threadTimeStyle = {
  fontWeight: 900,
  color: "rgba(11,18,32,0.60)",
  fontSize: 11,
  whiteSpace: "nowrap",
};

const threadPreviewStyle = {
  marginTop: 6,
  fontWeight: 800,
  color: "rgba(11,18,32,0.78)",
  fontSize: 12,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const threadMetaStyle = {
  marginTop: 6,
  fontWeight: 900,
  color: "rgba(11,18,32,0.55)",
  fontSize: 10,
};

const emptyThreadsStyle = {
  padding: 16,
  borderRadius: 14,
  border: "1px dashed rgba(17,24,39,0.20)",
  background: "rgba(255,255,255,0.85)",
  color: "rgba(11,18,32,0.70)",
  fontWeight: 900,
  textAlign: "center",
};

const chatShellStyle = {
  borderRadius: 18,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.12)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  minHeight: 520,
};

const chatHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 14px",
  background: "rgba(45,189,110,0.10)",
  borderBottom: "1px solid rgba(17,24,39,0.08)",
};

const chatDotStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  background: "#2DBD6E",
  boxShadow: "0 6px 14px rgba(45,189,110,0.35)",
};

const chatHeaderTextStyle = {
  fontWeight: 900,
  color: "#0B1220",
  letterSpacing: 0.2,
  fontSize: 12,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const chatHeaderBadgeStyle = {
  marginLeft: "auto",
  fontSize: 11,
  fontWeight: 900,
  color: "rgba(11,18,32,0.78)",
  border: "1px solid rgba(17,24,39,0.10)",
  borderRadius: 999,
  padding: "6px 10px",
  background: "rgba(255,255,255,0.94)",
};

const chatBodyStyle = {
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  background: "rgba(255,255,255,0.98)",
  overflowY: "auto",
  flex: 1,
};

const bubbleLeftWrapStyle = {
  display: "flex",
  justifyContent: "flex-start",
};

const bubbleRightWrapStyle = {
  display: "flex",
  justifyContent: "flex-end",
};

const bubbleLeftStyle = {
  maxWidth: 620,
  borderRadius: 16,
  padding: "10px 12px",
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(11,18,32,0.06)",
  boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
};

const bubbleRightStyle = {
  maxWidth: 620,
  borderRadius: 16,
  padding: "10px 12px",
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(45,189,110,0.10)",
  boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
};

const bubbleTextStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(11,18,32,0.82)",
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const bubbleMetaStyle = {
  marginTop: 6,
  fontSize: 10,
  fontWeight: 900,
  color: "rgba(11,18,32,0.55)",
  textAlign: "right",
};

const emptyStyle = {
  padding: 18,
  borderRadius: 14,
  border: "1px dashed rgba(17,24,39,0.20)",
  background: "rgba(255,255,255,0.85)",
  color: "rgba(11,18,32,0.70)",
  fontWeight: 900,
  textAlign: "center",
};

const loadingInlineStyle = {
  padding: 10,
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.65)",
  textAlign: "center",
};

const chatComposerStyle = {
  padding: 14,
  borderTop: "1px solid rgba(17,24,39,0.08)",
  background: "rgba(255,255,255,0.96)",
};

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.72)",
};

const textareaStyle = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.12)",
  fontFamily: "Arial, sans-serif",
  fontWeight: 800,
  outline: "none",
  background: "white",
  boxShadow: "0 12px 26px rgba(0,0,0,0.08)",
  resize: "vertical",
};

const sendRowStyle = {
  marginTop: 10,
  display: "flex",
  gap: 12,
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
};

const hintStyle = {
  fontSize: 11,
  fontWeight: 900,
  color: "rgba(11,18,32,0.60)",
  maxWidth: 640,
};

const sendBtnStyle = {
  border: "1px solid rgba(17,24,39,0.14)",
  background: "#0B1220",
  color: "white",
  padding: "12px 16px",
  borderRadius: 12,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 16px 32px rgba(0,0,0,0.14)",
  minWidth: 140,
};

const layoutStyleMobile = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12,
};

/* ---- Mobile nav styles copied from Kontakt.jsx pattern ---- */

const mobileHeaderWrapStyle = {
  position: "sticky",
  top: 14,
  zIndex: 80,
  margin: 14,
  alignSelf: "flex-start",
};

const brandLogoMobileStyle = {
  width: 28,
  height: 28,
  borderRadius: 10,
  objectFit: "cover",
  background: "white",
  border: "1px solid rgba(17,24,39,0.10)",
  boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
  flex: "0 0 auto",
};

const mobileMenuButtonStyle = {
  background: "rgba(255,255,255,0.98)",
  borderRadius: 14,
  padding: "10px 12px",
  display: "flex",
  alignItems: "center",
  gap: 10,
  border: "1px solid rgba(17,24,39,0.08)",
  boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
  cursor: "pointer",
  maxWidth: 340,
};

const mobileMenuTitleStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "#0B1220",
  letterSpacing: 0.2,
};

const mobileMenuSubRowStyle = {
  marginTop: 2,
  display: "flex",
  alignItems: "baseline",
  gap: 6,
  minWidth: 0,
};

const mobileMenuSubStyle = {
  fontSize: 11,
  fontWeight: 900,
  color: "rgba(17,24,39,0.70)",
  whiteSpace: "nowrap",
};

const mobileMenuNameStyle = {
  fontSize: 11,
  fontWeight: 900,
  color: "rgba(17,24,39,0.86)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 180,
};

const mobileCaretWrapStyle = {
  marginLeft: "auto",
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.7)",
  paddingLeft: 6,
};

const mobileDropdownStyle = {
  position: "absolute",
  top: "calc(100% + 10px)",
  left: 0,
  width: 240,
  background: "rgba(255,255,255,0.98)",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.10)",
  boxShadow: "0 18px 50px rgba(0,0,0,0.20)",
  padding: 10,
  zIndex: 90,
};

const mobileMenuItemStyle = {
  width: "100%",
  textAlign: "left",
  padding: "12px 12px",
  borderRadius: 12,
  border: "1px solid transparent",
  background: "transparent",
  fontWeight: 800,
  color: "#0B1220",
  cursor: "pointer",
};

const menuDividerStyle = {
  height: 1,
  background: "rgba(17,24,39,0.10)",
  margin: "8px 6px",
};

const menuBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.14)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  zIndex: 70,
};
