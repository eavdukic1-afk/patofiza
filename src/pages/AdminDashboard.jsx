import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { useAuth, markOffline } from "../auth/AuthProvider";
import logoMed from "../assets/logo_medicinski_fakultet.jpg";

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

function OnlinePill({ online }) {
  const label = online ? "Na mreži" : "Nije na mreži";
  const bg = online ? "rgba(34,197,94,0.14)" : "rgba(11,18,32,0.08)";
  const border = online ? "rgba(34,197,94,0.30)" : "rgba(11,18,32,0.14)";
  const dot = online ? "#22C55E" : "rgba(11,18,32,0.30)";

  return (
    <div style={{ ...statusPillStyle, background: bg, borderColor: border }}>
      <span style={{ ...statusDotStyle, background: dot }} />
      {label}
    </div>
  );
}

function StudentCard({ student, onClick }) {
  const fullName =
    `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() ||
    student.username ||
    "Student";

  return (
    <button type="button" style={studentCardStyle} onClick={onClick}>
      <div style={studentTopRowStyle}>
        <div style={studentNameStyle}>{fullName}</div>
        <OnlinePill online={!!student.is_online} />
      </div>
      <div style={studentSubStyle}>{student.username ? `${student.username}` : student.id}</div>
      <div style={studentHintStyle}>Kliknite za pregled sesija</div>
    </button>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);

  const [adminProfile, setAdminProfile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const [students, setStudents] = useState([]);
  const [query, setQuery] = useState("");

  // Mobile portrait detection
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

  // Load admin profile
  useEffect(() => {
    async function loadAdmin() {
      if (!user) return;
      const { data } = await supabase
        .from("users")
        .select("id,role,first_name,gender")
        .eq("id", user.id)
        .single();
      setAdminProfile(data ?? null);
    }
    loadAdmin();
  }, [user?.id]);

  // Load students list
  useEffect(() => {
    async function loadStudents() {
      if (!user) return;
      setLoading(true);
      setErrMsg("");

      try {
        // students = all non-admin users (adjust if you have role='student')
        const { data, error } = await supabase
          .from("users")
          .select("id,first_name,last_name,username,is_online,role")
          .neq("role", "admin")
          .order("is_online", { ascending: false })
          .order("last_name", { ascending: true, nullsFirst: false })
          .order("first_name", { ascending: true, nullsFirst: false });

        if (error) throw error;
        setStudents(data ?? []);
      } catch (e) {
        setErrMsg(e.message || "Greška pri učitavanju korisnika.");
      } finally {
        setLoading(false);
      }
    }

    loadStudents();
  }, [user?.id]);

  async function logout() {
    if (!user) return;
    await markOffline(user.id);
    await supabase.auth.signOut();
    nav("/login");
  }

  const greeting =
    adminProfile &&
    `${adminProfile.gender === "female" ? "Dobrodošla" : "Dobrodošao"}, ${
      adminProfile.first_name || "Admin"
    }!`;

  const go = (path) => {
    setIsMenuOpen(false);
    nav(path);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return (students ?? []).filter((s) => {
      const full = `${s.first_name ?? ""} ${s.last_name ?? ""}`.toLowerCase();
      const u = (s.username ?? "").toLowerCase();
      return full.includes(q) || u.includes(q) || (s.id ?? "").toLowerCase().includes(q);
    });
  }, [students, query]);

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
                    <div style={brandTitleStyle}>Admin</div>
                    <div style={brandSubtitleStyle}>{greeting}</div>
                  </div>
                </div>

                <div style={navLinksRowStyle}>                  <NavLink label="Korisnici" onClick={() => nav("/admin/users")} />                  <NavLink label="Korisnička podrška" onClick={() => nav("/admin/support")} />
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
                      <div style={mobileMenuSubStyle}>{greeting}</div>
                    </div>

                    <div style={mobileCaretWrapStyle} aria-hidden="true">
                      {isMenuOpen ? "▲" : "▼"}
                    </div>
                  </button>

                  {isMenuOpen && (
                    <div style={mobileDropdownStyle} role="menu">                      <MenuItem label="Korisnici" onClick={() => go("/admin/users")} />                      <MenuItem label="Korisnička podrška" onClick={() => go("/admin/support")} />
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
                    <div style={eyebrowStyle}>Admin</div>
                    <div style={titleStyle}>Početna stranica</div>
                    <div style={subtitleStyle}>Odaberite studenta za pregled sesija.</div>
                  </div>

                  <div style={searchWrapStyle}>
                    <div style={labelStyle}>Pretraga</div>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Ime / prezime / broj indexa…"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {errMsg && <div style={errorStyle}>{errMsg}</div>}

                {loading ? (
                  <div style={loadingStyle}>Učitavanje…</div>
                ) : (
                  <div style={gridStyle}>
                    {(filtered ?? []).map((s) => (
                      <StudentCard
                        key={s.id}
                        student={s}
                        onClick={() =>
                          nav(`/admin/sesije/${s.id}`, {
                            state: {
                              studentName: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(),
                              username: s.username ?? "",
                            },
                          })
                        }
                      />
                    ))}

                    {!filtered?.length && (
                      <div style={emptyStateStyle}>Nema rezultata za pretragu.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

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
  fontWeight: 900,
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
  fontWeight: 800,
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
  alignItems: "flex-end",
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
};

const searchWrapStyle = {
  minWidth: 260,
  maxWidth: 360,
  flex: "0 1 360px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.72)",
};

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.12)",
  fontFamily: "Arial, sans-serif",
  fontWeight: 800,
  outline: "none",
  background: "white",
  boxShadow: "0 12px 26px rgba(0,0,0,0.08)",
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

const loadingStyle = {
  marginTop: 16,
  padding: 18,
  textAlign: "center",
  fontWeight: 900,
  color: "rgba(11,18,32,0.78)",
};

const gridStyle = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const studentCardStyle = {
  width: "100%",
  textAlign: "left",
  borderRadius: 18,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.12)",
  padding: 14,
  cursor: "pointer",
};

const studentTopRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const studentNameStyle = {
  fontWeight: 900,
  color: "#0B1220",
  fontSize: 15,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const studentSubStyle = {
  marginTop: 6,
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.60)",
};

const studentHintStyle = {
  marginTop: 10,
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(11,18,32,0.72)",
  paddingTop: 10,
  borderTop: "1px solid rgba(17,24,39,0.06)",
};

const statusPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid rgba(11,18,32,0.14)",
  background: "rgba(11,18,32,0.08)",
  fontWeight: 900,
  color: "rgba(11,18,32,0.78)",
  whiteSpace: "nowrap",
  flex: "0 0 auto",
};

const statusDotStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  background: "rgba(11,18,32,0.30)",
};

const emptyStateStyle = {
  gridColumn: "1 / -1",
  padding: 18,
  borderRadius: 14,
  border: "1px dashed rgba(17,24,39,0.22)",
  background: "rgba(255,255,255,0.92)",
  color: "rgba(11,18,32,0.70)",
  fontWeight: 900,
  textAlign: "center",
};

// Mobile dropdown styles
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

const mobileMenuSubStyle = {
  marginTop: 2,
  fontSize: 11,
  fontWeight: 800,
  color: "rgba(17,24,39,0.78)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 220,
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
