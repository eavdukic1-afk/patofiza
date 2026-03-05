import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { useAuth, markOffline } from "../auth/AuthProvider";
import logoMed from "../assets/logo_medicinski_fakultet.jpg";

/**
 * AdminUsers (/admin/users)
 *
 * REQUIREMENTS (your last message):
 * - Show ONLY students (users.role === 'student') — no admins, no null roles.
 * - Remove columns: Uloga, Status, Moduli.
 * - Keep per-student stats:
 *   - Total time (sum duration_minutes)
 *   - Average grade (avg of grade where not null)
 *   - Per-module: time + avg grade per module (theory/practical description)
 */

const PAGE_SIZE = 1000;
const MAX_SESSION_ROWS = 20000; // safety cap (increase if your dataset is bigger)

function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}
function minutesToHM(min) {
  const m = Number(min || 0);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r} min`;
  if (r === 0) return `${h} h`;
  return `${h} h ${r} min`;
}
function avgToText(sum, count) {
  if (!count) return "—";
  return (sum / count).toFixed(2);
}

function weightedAvgToText(weightedSum, weightSum) {
  const w = Number(weightSum || 0);
  if (!w) return "—";
  return (Number(weightedSum || 0) / w).toFixed(2);
}

function getFullName(u) {
  const s = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  return s || u.username || "—";
}

function moduleKey(session) {
  if (session?.theory_id) return `theory:${session.theory_id}`;
  if (session?.practical_id) return `practical:${session.practical_id}`;
  return null;
}
function moduleType(session) {
  if (session?.theory_id) return "Teorijski";
  if (session?.practical_id) return "Praktični";
  return "—";
}
function moduleLabel(session) {
  const t = session?.theory;
  const p = session?.practical;
  if (session?.theory_id) return t?.description || t?.name || `Teorija #${session.theory_id}`;
  if (session?.practical_id) return p?.description || p?.name || `Praksa #${session.practical_id}`;
  return "—";
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

export default function AdminUsers() {
  const { user } = useAuth();
  const nav = useNavigate();

  // Responsive menu
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);

  const [adminProfile, setAdminProfile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const [users, setUsers] = useState([]);
  const [statsByUserId, setStatsByUserId] = useState(new Map());
  const [expanded, setExpanded] = useState(() => new Set());

  const [q, setQ] = useState("");

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

  // Load admin profile (greeting)
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

  async function loadAllSessions() {
    let from = 0;
    let all = [];

    while (true) {
      const { data, error } = await supabase
        .from("sessions")
        .select(
          "user_id,duration_minutes,grade,theory_id,practical_id,theory:theory_id(id,name,description),practical:practical_id(id,name,description)"
        )
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      all = all.concat(data ?? []);

      if (!data || data.length < PAGE_SIZE) break;

      from += PAGE_SIZE;
      if (from >= MAX_SESSION_ROWS) break;
    }

    return all;
  }

  function computeStats(usersList, sessions) {
    const map = new Map();

    (usersList ?? []).forEach((u) => {
      map.set(u.id, {
        totalMinutes: 0,
        gradeSum: 0,
        gradeCount: 0,
        modules: new Map(), // key -> { key,label,type,minutes,gradeSum,gradeCount }
      });
    });

    (sessions ?? []).forEach((s) => {
      const uid = s?.user_id;
      if (!uid || !map.has(uid)) return; // only compute for students we loaded

      const entry = map.get(uid);

      const minutes = Number(s.duration_minutes || 0);
      entry.totalMinutes += minutes;

      const g = s.grade;
      if (g !== null && g !== undefined && g !== "") {
        const gv = Number(g);
        if (Number.isFinite(gv)) {
          entry.gradeSum += gv;
          entry.gradeCount += 1;
        }
      }

      const k = moduleKey(s);
      if (!k) return;

      const label = moduleLabel(s);
      const type = moduleType(s);

      const mod =
        entry.modules.get(k) ||
        (() => {
          const m = { key: k, label, type, minutes: 0, gradeSum: 0, gradeCount: 0, gradeWeightedSum: 0, gradeWeightMinutes: 0 };
          entry.modules.set(k, m);
          return m;
        })();

      mod.minutes += minutes;

      if (g !== null && g !== undefined && g !== "") {
        const gv = Number(g);
        if (Number.isFinite(gv)) {
          mod.gradeSum += gv;
          mod.gradeCount += 1;
          mod.gradeWeightedSum += gv * minutes;
          mod.gradeWeightMinutes += minutes;
        }
      }
    });

    return map;
  }

  // Load students + sessions and compute stats
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) return;

      setLoading(true);
      setErrMsg("");

      try {
        const { data: usersData, error: uErr } = await supabase
          .from("users")
          .select("id,username,created_at,last_seen,first_name,last_name,gender,birthdate,role")
          .eq("role", "student")
          .order("last_name", { ascending: true, nullsFirst: false })
          .order("first_name", { ascending: true, nullsFirst: false });

        if (uErr) throw uErr;

        const sessions = await loadAllSessions();

        if (!cancelled) {
          setUsers(usersData ?? []);
          setStatsByUserId(computeStats(usersData ?? [], sessions));
        }
      } catch (e) {
        if (!cancelled) setErrMsg(e.message || "Greška pri učitavanju podataka.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filteredUsers = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return users;

    return (users ?? []).filter((u) => {
      const hay = `${u.first_name ?? ""} ${u.last_name ?? ""} ${u.username ?? ""} ${u.id ?? ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [users, q]);

  function toggleExpand(userId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
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
                      <div style={mobileMenuSubStyle}>{greeting}</div>
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
                    <div style={eyebrowStyle}>Admin</div>
                    <div style={titleStyle}>Studenti</div>
                    <div style={subtitleStyle}>
                      Pregled studenata i statistika učenja (ukupno vrijeme, prosječna ocjena, po modulima).
                    </div>
                  </div>

                  <div style={filtersWrapStyle}>
                    <div style={fieldStyle}>
                      <div style={labelStyle}>Pretraga</div>
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Ime / prezime / broj indexa... "
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>

                {errMsg && <div style={errorStyle}>{errMsg}</div>}

                {loading ? (
                  <div style={loadingStyle}>Učitavanje…</div>
                ) : (
                  <div style={tableShellStyle}>
                    <div style={tableScrollStyle}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Korisnik</th>
                            <th style={thStyleCenter}>Kreiran</th>
                            <th style={thStyleCenter}>Posljednji put viđen/a</th>
                            <th style={thStyleRight}>Ukupno vrijeme</th>
                            <th style={thStyleRight}>Prosječna ocjena</th>
                            <th style={thStyleRight}></th>
                          </tr>
                        </thead>

                        <tbody>
                          {(filteredUsers ?? []).map((u) => {
                            const st = statsByUserId.get(u.id) || {
                              totalMinutes: 0,
                              gradeSum: 0,
                              gradeCount: 0,
                              modules: new Map(),
                            };

                            const expandedRow = expanded.has(u.id);

                            return (
                              <Fragment key={u.id}>
                                <tr style={trStyle}>
                                  <td style={tdStyle}>
                                    <div style={userCellStyle}>
                                      <div style={userNameStyle}>{getFullName(u)}</div>
                                      <div style={userSubStyle}>{u.username ? `@${u.username}` : u.id}</div>
                                    </div>
                                  </td>

                                  <td style={tdStyleCenter}>{u.created_at ? formatDate(u.created_at) : "—"}</td>

                                  <td style={tdStyleCenter}>{u.last_seen ? formatDateTime(u.last_seen) : "—"}</td>

                                  <td style={tdStyleRight}>{minutesToHM(st.totalMinutes)}</td>
                                  <td style={tdStyleRight}>{avgToText(st.gradeSum, st.gradeCount)}</td>

                                  <td style={tdStyleRight}>
                                    <button
                                      type="button"
                                      style={miniBtnStyle}
                                      onClick={() => toggleExpand(u.id)}
                                    >
                                      {expandedRow ? "Sakrij" : "Detalji"}
                                    </button>
                                  </td>
                                </tr>

                                {expandedRow && (
                                  <tr>
                                    <td colSpan={6} style={detailsCellStyle}>
                                      <UserDetails
                                        user={u}
                                        stats={st}
                                        onOpenSessions={() => nav(`/admin/sesije/${u.id}`)}
                                      />
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}

                          {!filteredUsers?.length && (
                            <tr>
                              <td colSpan={6} style={{ ...tdStyle, padding: 18 }}>
                                {q.trim()
                                  ? "Nema rezultata za pretragu."
                                  : "Nema studenata u bazi (role = student) ili admin nema permisije (RLS) da ih čita."}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
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

function UserDetails({ user, stats, onOpenSessions }) {
  const modules = useMemo(() => {
    const arr = Array.from(stats.modules.values());
    arr.sort((a, b) => (b.minutes || 0) - (a.minutes || 0));
    return arr;
  }, [stats]);

  return (
    <div style={detailsWrapStyle}>
      <div style={detailsHeaderStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={detailsTitleStyle}>{getFullName(user)}</div>
          <div style={detailsSubStyle}>
            {user.birthdate ? `Datum rođenja: ${formatDate(user.birthdate)}` : "Datum rođenja: —"} •{" "}
            {user.gender ? `Spol: ${user.gender === "female" ? "Žensko" : "Muško"}` : "Spol: —"}
            
          </div>
        </div>

        <div style={detailsHeaderRightStyle}>
          <div style={summaryPillStyle}>
            Ukupno: <span style={summaryStrongStyle}>{minutesToHM(stats.totalMinutes)}</span>
          </div>
          <div style={summaryPillStyle}>
            Konačna prosječna ocjena: <span style={summaryStrongStyle}>{avgToText(stats.gradeSum, stats.gradeCount)}</span>
          </div>

          <button type="button" onClick={onOpenSessions} style={openSessionsBtnStyle}>
            Otvori sesije
          </button>
        </div>
      </div>

      <div style={modulesShellStyle}>
        <div style={modulesTitleStyle}>Po modulima</div>

        <div style={modulesTableScrollStyle}>
          <table style={modulesTableStyle}>
            <thead>
              <tr>
                <th style={mthStyle}>Tip</th>
                <th style={mthStyle}>Modul</th>
                <th style={mthStyleRight}>Vrijeme</th>
                <th style={mthStyleRight}>Prosječna ocjena</th>
                <th style={mthStyleRight}>Broj sesija</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.key}>
                  <td style={mtdStyle}>{m.type}</td>
                  <td style={mtdStyle}>{m.label}</td>
                  <td style={mtdStyleRight}>{minutesToHM(m.minutes)}</td>
                  <td style={mtdStyleRight}>{weightedAvgToText(m.gradeWeightedSum, m.gradeWeightMinutes)}</td>
                  <td style={mtdStyleRight}>{m.gradeCount || 0}</td>
                </tr>
              ))}

              {!modules.length && (
                <tr>
                  <td style={{ ...mtdStyle, padding: 14 }} colSpan={5}>
                    Nema sesija za ovog studenta.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
  maxWidth: 300,
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
  maxWidth: 680,
};

const filtersWrapStyle = {
  display: "flex",
  alignItems: "flex-end",
  gap: 12,
  flexWrap: "wrap",
};

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 260,
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

const tableShellStyle = { marginTop: 14 };

const tableScrollStyle = {
  overflowX: "auto",
  borderRadius: 18,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.12)",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 920,
  fontFamily: "Arial, sans-serif",
};

const thStyle = {
  textAlign: "left",
  padding: "12px 12px",
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.78)",
  borderBottom: "1px solid rgba(17,24,39,0.08)",
  background: "rgba(45,189,110,0.10)",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const thStyleCenter = { ...thStyle, textAlign: "center" };

const thStyleRight = { ...thStyle, textAlign: "right" };

const trStyle = { background: "rgba(255,255,255,0.98)" };

const tdStyle = {
  padding: "12px 12px",
  fontSize: 13,
  fontWeight: 800,
  color: "#0B1220",
  borderBottom: "1px solid rgba(17,24,39,0.06)",
  verticalAlign: "top",
};

const tdStyleCenter = { ...tdStyle, textAlign: "center", whiteSpace: "nowrap" };

const tdStyleRight = { ...tdStyle, textAlign: "right", whiteSpace: "nowrap" };

const userCellStyle = { display: "flex", flexDirection: "column", gap: 4, minWidth: 220 };

const userNameStyle = { fontWeight: 900, fontSize: 14 };

const userSubStyle = { fontWeight: 900, fontSize: 11, color: "rgba(11,18,32,0.60)" };

const miniBtnStyle = {
  border: "1px solid rgba(17,24,39,0.12)",
  background: "rgba(255,255,255,0.96)",
  padding: "10px 12px",
  borderRadius: 12,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
};

const detailsCellStyle = { padding: 0, borderBottom: "1px solid rgba(17,24,39,0.06)" };

const detailsWrapStyle = { padding: 14, display: "flex", flexDirection: "column", gap: 12 };

const detailsHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const detailsTitleStyle = { fontWeight: 900, fontSize: 16, color: "#0B1220" };

const detailsSubStyle = {
  marginTop: 6,
  fontWeight: 900,
  fontSize: 12,
  color: "rgba(11,18,32,0.70)",
};

const detailsHeaderRightStyle = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };

const summaryPillStyle = {
  padding: "10px 12px",
  borderRadius: 999,
  border: "1px solid rgba(45,189,110,0.24)",
  background: "rgba(45,189,110,0.10)",
  fontWeight: 900,
  color: "rgba(11,18,32,0.84)",
};

const summaryStrongStyle = { color: "#0B1220" };

const openSessionsBtnStyle = {
  border: "1px solid rgba(17,24,39,0.12)",
  background: "#0B1220",
  color: "white",
  padding: "10px 12px",
  borderRadius: 12,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 16px 32px rgba(0,0,0,0.14)",
};

const modulesShellStyle = {
  borderRadius: 18,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.10)",
  padding: 12,
};

const modulesTitleStyle = { fontSize: 12, fontWeight: 900, color: "rgba(11,18,32,0.70)" };

const modulesTableScrollStyle = { marginTop: 10, overflowX: "auto" };

const modulesTableStyle = { width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 700 };

const mthStyle = {
  textAlign: "left",
  padding: "10px 10px",
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.78)",
  borderBottom: "1px solid rgba(17,24,39,0.08)",
  background: "rgba(11,18,32,0.04)",
};

const mthStyleRight = { ...mthStyle, textAlign: "right" };

const mtdStyle = {
  padding: "10px 10px",
  fontSize: 13,
  fontWeight: 800,
  color: "#0B1220",
  borderBottom: "1px solid rgba(17,24,39,0.06)",
};

const mtdStyleRight = { ...mtdStyle, textAlign: "right", whiteSpace: "nowrap" };

const footNoteStyle = {
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(45,189,110,0.10)",
  color: "rgba(11,18,32,0.78)",
  fontWeight: 800,
  fontSize: 12,
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
