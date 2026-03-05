import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { useAuth, markOffline } from "../auth/AuthProvider";
import logoMed from "../assets/logo_medicinski_fakultet.jpg";

/**
 * Kontakt (Support inbox) — old design (chat-like), no Subject
 * Requires table: public.support_messages (see SQL in chat).
 *
 * User flow:
 * - User writes message -> insert into support_messages (sender_role="user")
 * - Admin replies by inserting into support_messages (sender_role="admin") with same user_id
 * - User sees conversation here (realtime)
 *
 * Admin online indicator:
 * - Reads the first user with role='admin' from public.users and checks is_online
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function NavLink({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      type="button"
      style={navLinkStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(17,24,39,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
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

export default function Kontakt() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);

  const [profile, setProfile] = useState(null);

  const [adminOnline, setAdminOnline] = useState(null); // true/false/null
  const [adminName, setAdminName] = useState("Admin");

  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [status, setStatus] = useState(null); // {kind:'ok'|'warn'|'err', text}

  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
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

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      const { data } = await supabase
        .from("users")
        .select("first_name, gender")
        .eq("id", user.id)
        .single();
      setProfile(data ?? null);
    }
    loadProfile();
  }, [user?.id]);

  // Admin online indicator (poll)
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadAdminStatus() {
      try {
        const { data, error } = await supabase.rpc("get_admin_presence");
        const row = Array.isArray(data) ? data[0] : data;

        if (error) throw error;
        if (!cancelled) {
          setAdminOnline(typeof row?.is_online === "boolean" ? row.is_online : null);
          setAdminName(row?.first_name || "Admin");
        }
      } catch {
        if (!cancelled) {
          setAdminOnline(null);
          setAdminName("Admin");
        }
      }
    }

    loadAdminStatus();
    const id = setInterval(loadAdminStatus, 8000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.id]);

  async function loadMessages() {
    if (!user) return;
    setLoading(true);
    setErrMsg("");

    try {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id,created_at,user_id,sender_role,message")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data ?? []);
    } catch (e) {
      setErrMsg(e.message || "Greška pri učitavanju poruka.");
    } finally {
      setLoading(false);
    }
  }

  // Load + realtime
  useEffect(() => {
    if (!user) return;

    loadMessages();

    const channel = supabase
      .channel(`support_messages_user_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_messages",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadMessages()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Auto scroll to bottom
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  async function logout() {
    if (!user) return;
    await markOffline(user.id);
    await supabase.auth.signOut();
    nav("/login");
  }

  const greetingWord = profile?.gender === "female" ? "Dobrodošla" : "Dobrodošao";
  const firstName = profile?.first_name ?? "";
  const greeting =
    profile &&
    `${profile.gender === "female" ? "Dobrodošla" : "Dobrodošao"}, ${profile.first_name}!`;

  const go = (path) => {
    setIsMenuOpen(false);
    nav(path);
  };

  const onlineLabel = useMemo(() => {
    if (adminOnline === true) return `Administrator na mreži`;
    if (adminOnline === false) return `Administrator nije na mreži`;
    return "Administrator status nepoznat";
  }, [adminOnline, adminName]);

  async function sendMessage() {
    if (!user) return;
    const text = message.trim();
    if (!text) {
      setStatus({ kind: "err", text: "Napišite poruku prije slanja." });
      return;
    }

    setSending(true);
    setStatus(null);
    setErrMsg("");

    try {
      const { error } = await supabase.from("support_messages").insert([
        {
          user_id: user.id,
          sender_role: "user",
          message: text,
        },
      ]);
      if (error) throw error;

      setMessage("");
      setStatus({ kind: "ok", text: "Poruka poslana ✅" });
    } catch (e) {
      setStatus({ kind: "err", text: e.message || "Greška pri slanju poruke." });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div style={pageStyle}>
        <div style={frameStyle}>
          <div style={panelStyle}>
            {/* NAVIGATION */}
            {!isMobilePortrait ? (
              <div style={topNavStyle}>
                <div style={brandStyle}>
                  <img src={logoMed} alt="Medicinski fakultet" style={brandLogoStyle} />
                  <div style={{ lineHeight: 1.1 }}>
                    <div style={brandTitleStyle}>Student</div>
                    <div style={brandSubtitleStyle}>{greeting}</div>
                  </div>
                </div>

                <div style={navLinksRowStyle}>
                  <NavLink label="Početna stranica" onClick={() => nav("/")} />
                  <NavLink label="Moj profil" onClick={() => nav("/profil")} />
                  <NavLink label="Moje sesije" onClick={() => nav("/sesije")} />
                  <NavLink label="Uputstva" onClick={() => nav("/uputstva")} />
                  <NavLink label="Kontakt" onClick={() => nav("/kontakt")} />
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
                      <div style={mobileMenuTitleStyle}>Student</div>
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
                      <MenuItem label="Početna stranica" onClick={() => go("/")} />
                      <MenuItem label="Moj profil" onClick={() => go("/profil")} />
                      <MenuItem label="Moje sesije" onClick={() => go("/sesije")} />
                      <MenuItem label="Uputstva" onClick={() => go("/uputstva")} />
                      <MenuItem label="Kontakt" onClick={() => go("/kontakt")} />
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
                    <div style={titleStyle}>Kontakt</div>
                    <div style={subtitleStyle}>
                      Napišite poruku administratoru. Dobit ćete odgovor u inboxu ispod.
                    </div>
                  </div>

                  <div style={onlinePillStyle}>
                    <span
                      style={{
                        ...onlineDotStyle,
                        background:
                          adminOnline === true
                            ? "#22C55E"
                            : adminOnline === false
                            ? "rgba(11,18,32,0.25)"
                            : "rgba(11,18,32,0.18)",
                      }}
                    />
                    {onlineLabel}
                  </div>
                </div>

                {errMsg && <div style={errorStyle}>{errMsg}</div>}

                {/* Chat-like box (old style) */}
                <div style={chatShellStyle}>
                  <div style={chatHeaderStyle}>
                    <div style={chatDotStyle} />
                    
                    <div style={chatHeaderBadgeStyle}>Inbox</div>
                  </div>

                  <div style={chatBodyStyle} ref={listRef}>
                    <div style={bubbleLeftStyle}>
                      <div style={bubbleTitleStyle}>Kako Vam mogu pomoći?</div>
                      <div style={bubbleTextStyle}>
                        Napišite poruku ispod, pa kliknite 'Pošalji'.
                      </div>
                    </div>

                    {loading ? (
                      <div style={loadingInlineStyle}>Učitavanje…</div>
                    ) : messages?.length ? (
                      messages.map((m) => {
                        const isUser = m.sender_role === "user";
                        return (
                          <div
                            key={m.id}
                            style={isUser ? bubbleRightWrapStyle : bubbleLeftWrapStyle}
                          >
                            <div style={isUser ? bubbleRightStyle : bubbleLeftStyle}>
                              <div style={bubbleTextStyle}>{m.message}</div>
                              <div style={bubbleMetaStyle}>{formatTime(m.created_at)}</div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={emptyStyle}>Nema poruka. Napišite prvu poruku 👇</div>
                    )}

                    {/* Preview bubble of what user is typing */}
                    {message.trim() ? (
                      <div style={bubbleRightWrapStyle}>
                        <div style={bubbleRightStyle}>
                          <div style={bubbleTextStyle}>{message.trim()}</div>
                          <div style={bubbleMetaStyle}>skica</div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div style={chatComposerStyle}>
                    <div style={fieldStyle}>
                      <div style={labelStyle}>Poruka</div>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Napišite poruku…"
                        style={textareaStyle}
                        rows={5}
                      />
                    </div>

                    <div style={sendRowStyle}>
                      {status ? (
                        <div
                          style={{
                            ...statusStyle,
                            ...(status.kind === "ok"
                              ? statusOkStyle
                              : status.kind === "warn"
                              ? statusWarnStyle
                              : statusErrStyle),
                          }}
                        >
                          {status.text}
                        </div>
                      ) : (
                        <div style={hintStyle}>
                          
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={sendMessage}
                        disabled={sending || !message.trim()}
                        style={{
                          ...sendBtnStyle,
                          opacity: sending || !message.trim() ? 0.55 : 1,
                          cursor: sending || !message.trim() ? "not-allowed" : "pointer",
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

      {/* Mobile blur backdrop when dropdown menu is open */}
      {isMobilePortrait && isMenuOpen && (
        <div style={menuBackdropStyle} onClick={() => setIsMenuOpen(false)} aria-hidden="true" />
      )}
    </>
  );
}

// ----- Styles -----

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

const mobileHeaderWrapStyle = {
  position: "sticky",
  top: 14,
  zIndex: 80,
  margin: 14,
  alignSelf: "flex-start",
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

const onlinePillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 999,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 12px 26px rgba(0,0,0,0.10)",
  fontWeight: 900,
  color: "rgba(11,18,32,0.78)",
  whiteSpace: "nowrap",
};

const onlineDotStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
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

// Chat UI (old design)
const chatShellStyle = {
  marginTop: 14,
  borderRadius: 18,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.12)",
  overflow: "hidden",
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
  display: "grid",
  gap: 10,
  minHeight: 220,
  background: "rgba(255,255,255,0.98)",
  overflowY: "auto",
  maxHeight: 420,
};

const bubbleLeftWrapStyle = {
  justifySelf: "start",
  width: "100%",
  display: "flex",
  justifyContent: "flex-start",
};

const bubbleRightWrapStyle = {
  justifySelf: "end",
  width: "100%",
  display: "flex",
  justifyContent: "flex-end",
};

const bubbleLeftStyle = {
  maxWidth: 520,
  borderRadius: 16,
  padding: "10px 12px",
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(45,189,110,0.10)",
  boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
};

const bubbleRightStyle = {
  maxWidth: 520,
  borderRadius: 16,
  padding: "10px 12px",
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(11,18,32,0.06)",
  boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
};

const bubbleTitleStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "#0B1220",
};

const bubbleTextStyle = {
  marginTop: 4,
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(11,18,32,0.78)",
  lineHeight: 1.4,
  whiteSpace: "pre-wrap",
};

const bubbleMetaStyle = {
  marginTop: 6,
  fontSize: 10,
  fontWeight: 900,
  color: "rgba(11,18,32,0.55)",
  textAlign: "right",
};

const loadingInlineStyle = {
  padding: 10,
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.65)",
  textAlign: "center",
};

const emptyStyle = {
  padding: 14,
  borderRadius: 14,
  border: "1px dashed rgba(17,24,39,0.20)",
  background: "rgba(255,255,255,0.85)",
  color: "rgba(11,18,32,0.70)",
  fontWeight: 900,
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

const statusStyle = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.10)",
  fontWeight: 900,
  fontSize: 12,
};

const statusOkStyle = {
  background: "rgba(45,189,110,0.12)",
  borderColor: "rgba(45,189,110,0.24)",
  color: "#0B1220",
};

const statusWarnStyle = {
  background: "rgba(245,158,11,0.12)",
  borderColor: "rgba(245,158,11,0.24)",
  color: "#7C2D12",
};

const statusErrStyle = {
  background: "rgba(185,28,28,0.10)",
  borderColor: "rgba(185,28,28,0.22)",
  color: "#7F1D1D",
};

// Mobile menu
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
  maxWidth: 320,
};

const mobileMenuTitleStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "#0B1220",
  letterSpacing: 0.2,
};

const mobileMenuSubRowStyle = {
  display: "flex",
  alignItems: "baseline",
  gap: 6,
  marginTop: 2,
  minWidth: 0,
};

const mobileMenuSubStyle = {
  fontSize: 11,
  fontWeight: 800,
  color: "rgba(17,24,39,0.78)",
  whiteSpace: "nowrap",
};

const mobileMenuNameStyle = {
  fontSize: 11,
  fontWeight: 900,
  color: "#0B1220",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 150,
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
