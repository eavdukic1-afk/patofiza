import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth, markOffline } from "../auth/AuthProvider";
import logoMed from "../assets/logo_medicinski_fakultet.jpg";

/**
 * AdminSesije (/admin/sesije/:userId)
 * Same capabilities as MojeSesije.jsx, but for a selected student (userId param).
 */

function toISOStartOfDay(dateStr) {
  if (!dateStr) return null;
  return new Date(`${dateStr}T00:00:00`).toISOString();
}
function toISOEndOfDayExclusive(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}
function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function minutesToHM(min) {
  const m = Number(min || 0);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r} min`;
  if (r === 0) return `${h} h`;
  return `${h} h ${r} min`;
}
function monthToRange(monthStr) {
  if (!monthStr) return null;
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0);
  return { startISO: start.toISOString(), endISO: end.toISOString(), year: y, monthIndex: m - 1 };
}
function weekDayIndexMon0(date) {
  return (date.getDay() + 6) % 7;
}

function getModuleLabel(session) {
  const theory = session?.theory;
  const practical = session?.practical;
  const tDesc = theory?.description || theory?.name;
  const pDesc = practical?.description || practical?.name;
  if (session?.theory_id) return tDesc || "Teorijski modul";
  if (session?.practical_id) return pDesc || "Praktični modul";
  return "—";
}
function getModuleType(session) {
  if (session?.theory_id) return "Teorijski";
  if (session?.practical_id) return "Praktični";
  return "—";
}
function buildModuleOptions(theoryList, practicalList) {
  const options = [
    { value: "all", label: "Svi moduli" },
    { value: "type:theory", label: "Svi teorijski" },
    { value: "type:practical", label: "Svi praktični" },
  ];

  if (theoryList?.length) {
    options.push({ value: "sep1", label: "— Teorijski —", disabled: true });
    theoryList.forEach((m) => {
      const label = m.description || m.name || `Teorija #${m.id}`;
      options.push({ value: `theory:${m.id}`, label });
    });
  }

  if (practicalList?.length) {
    options.push({ value: "sep2", label: "— Praktični —", disabled: true });
    practicalList.forEach((m) => {
      const label = m.description || m.name || `Praksa #${m.id}`;
      options.push({ value: `practical:${m.id}`, label });
    });
  }

  return options;
}

function applyModuleFilter(query, filterValue) {
  if (!filterValue || filterValue === "all") return query;

  if (filterValue === "type:theory") return query.not("theory_id", "is", null);
  if (filterValue === "type:practical") return query.not("practical_id", "is", null);

  const [kind, idStr] = filterValue.split(":");
  const id = Number(idStr);

  if (kind === "theory" && Number.isFinite(id)) return query.eq("theory_id", id);
  if (kind === "practical" && Number.isFinite(id)) return query.eq("practical_id", id);

  return query;
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

export default function AdminSesije() {
  const { user } = useAuth(); // admin user
  const nav = useNavigate();
  const params = useParams();
  const loc = useLocation();

  const studentId = params.userId;

  // Responsive menu
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);

  const [adminProfile, setAdminProfile] = useState(null);
  const [studentProfile, setStudentProfile] = useState(null);

  const [view, setView] = useState("table"); // "table" | "graph"
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const [theory, setTheory] = useState([]);
  const [practical, setPractical] = useState([]);
  const moduleOptions = useMemo(() => buildModuleOptions(theory, practical), [theory, practical]);

  // Table filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");

  // Graph filters
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  });
  const [graphModuleFilter, setGraphModuleFilter] = useState("all");

  const [sessions, setSessions] = useState([]);
  const [monthSessions, setMonthSessions] = useState([]);

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

  // Load admin + student profile
  useEffect(() => {
    async function loadProfiles() {
      if (!user || !studentId) return;

      const [{ data: a }, { data: s }] = await Promise.all([
        supabase.from("users").select("id,role,first_name,gender").eq("id", user.id).single(),
        supabase
          .from("users")
          .select("id,first_name,last_name,username,is_online")
          .eq("id", studentId)
          .single(),
      ]);

      setAdminProfile(a ?? null);
      setStudentProfile(s ?? null);
    }

    loadProfiles();
  }, [user?.id, studentId]);

  // Load modules
  useEffect(() => {
    async function loadModules() {
      if (!user) return;
      const [{ data: t }, { data: p }] = await Promise.all([
        supabase.from("theory").select("id,name,description").order("id"),
        supabase.from("practical").select("id,name,description").order("id"),
      ]);

      setTheory(t ?? []);
      setPractical(p ?? []);
    }
    loadModules();
  }, [user?.id]);

  // Load sessions for table view
  useEffect(() => {
    if (!user || !studentId) return;
    if (view !== "table") return;

    let isCancelled = false;

    async function load() {
      setLoading(true);
      setErrMsg("");

      try {
        let q = supabase
          .from("sessions")
          .select(
            "id,user_id,start_time,end_time,duration_minutes,grade,created_at,theory_id,practical_id,theory:theory_id(id,name,description),practical:practical_id(id,name,description)"
          )
          .eq("user_id", studentId)
          .order("start_time", { ascending: false });

        if (fromDate) q = q.gte("start_time", toISOStartOfDay(fromDate));
        if (toDate) q = q.lt("start_time", toISOEndOfDayExclusive(toDate));
        q = applyModuleFilter(q, moduleFilter);

        const { data, error } = await q;
        if (error) throw error;

        if (!isCancelled) setSessions(data ?? []);
      } catch (e) {
        if (!isCancelled) setErrMsg(e.message || "Greška pri učitavanju sesija.");
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    load();
    return () => {
      isCancelled = true;
    };
  }, [user?.id, studentId, view, fromDate, toDate, moduleFilter]);

  // Load sessions for graph view
  useEffect(() => {
    if (!user || !studentId) return;
    if (view !== "graph") return;

    const range = monthToRange(month);
    if (!range) return;

    let isCancelled = false;

    async function load() {
      setLoading(true);
      setErrMsg("");

      try {
        let q = supabase
          .from("sessions")
          .select(
            "id,start_time,duration_minutes,theory_id,practical_id,theory:theory_id(id,name,description),practical:practical_id(id,name,description)"
          )
          .eq("user_id", studentId)
          .gte("start_time", range.startISO)
          .lt("start_time", range.endISO)
          .order("start_time", { ascending: true });

        q = applyModuleFilter(q, graphModuleFilter);

        const { data, error } = await q;
        if (error) throw error;

        if (!isCancelled) setMonthSessions(data ?? []);
      } catch (e) {
        if (!isCancelled) setErrMsg(e.message || "Greška pri učitavanju sesija.");
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    load();
    return () => {
      isCancelled = true;
    };
  }, [user?.id, studentId, view, month, graphModuleFilter]);

  const totalMinutes = useMemo(() => {
    const arr = view === "table" ? sessions : monthSessions;
    return arr.reduce((sum, s) => sum + Number(s.duration_minutes || 0), 0);
  }, [view, sessions, monthSessions]);

  const monthCalendar = useMemo(() => {
    if (view !== "graph") return null;
    const range = monthToRange(month);
    if (!range) return null;

    const year = range.year;
    const monthIndex = range.monthIndex;

    const first = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const offset = weekDayIndexMon0(first);

    const map = new Map();
    monthSessions.forEach((s) => {
      const d = new Date(s.start_time);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      map.set(key, (map.get(key) || 0) + Number(s.duration_minutes || 0));
    });

    let max = 0;
    for (const v of map.values()) max = Math.max(max, v);

    const cells = [];
    for (let i = 0; i < offset; i++) cells.push({ kind: "empty", key: `e-${i}` });

    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
      const minutes = map.get(key) || 0;
      const intensity = max > 0 ? minutes / max : 0;

      cells.push({ kind: "day", key, day, minutes, intensity });
    }

    while (cells.length % 7 !== 0) cells.push({ kind: "empty", key: `t-${cells.length}` });

    return { cells, maxMinutes: max };
  }, [view, month, monthSessions]);

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

  const stateName = loc?.state?.studentName;
  const computedName =
    stateName ||
    `${studentProfile?.first_name ?? ""} ${studentProfile?.last_name ?? ""}`.trim() ||
    studentProfile?.username ||
    studentId;

  const studentOnline = !!studentProfile?.is_online;

  // Mobile tweaks: slightly thinner white frame border + more usable width/height
  const pageStyleDyn = isMobilePortrait ? { ...pageStyle, padding: 16 } : pageStyle;
  const frameStyleDyn = isMobilePortrait ? { ...frameStyle, padding: 10 } : frameStyle;
  const panelStyleDyn = isMobilePortrait
    ? { ...panelStyle, minHeight: "calc(100vh - 64px)" }
    : panelStyle;

  return (
    <>
      <div style={pageStyleDyn}>
        <div style={frameStyleDyn}>
          <div style={panelStyleDyn}>
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
                {/* Header */}
                <div style={headerRowStyle}>
                  <div>
                    <div style={eyebrowStyle}>Sesije</div>
                    <div style={titleStyle}>{computedName}</div>
                    <div style={subtitleStyle}>
                      Filtrirajte sesije po
                      datumu i modulu, ili pregledajte na kalendaru po danima.
                    </div>
                  </div>

                  <div style={headerActionsStyle}>
                    
                    <div style={toggleWrapStyle}>
                      <button
                        type="button"
                        onClick={() => setView("table")}
                        style={{
                          ...toggleBtnStyle,
                          ...(view === "table" ? toggleBtnActiveStyle : null),
                        }}
                      >
                        Tabela
                      </button>
                      <button
                        type="button"
                        onClick={() => setView("graph")}
                        style={{
                          ...toggleBtnStyle,
                          ...(view === "graph" ? toggleBtnActiveStyle : null),
                        }}
                      >
                        Kalendar
                      </button>
                    </div>
                  </div>
                </div>

                {/* Filters */}
                <div style={filtersCardStyle}>
                  {view === "table" ? (
                    <div style={filtersRowStyle}>
                      <div style={fieldStyle}>
                        <div style={labelStyle}>Od</div>
                        <input
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          style={inputStyle}
                        />
                      </div>

                      <div style={fieldStyle}>
                        <div style={labelStyle}>Do</div>
                        <input
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          style={inputStyle}
                        />
                      </div>

                      <div style={{ ...fieldStyle, minWidth: 240, flex: 1 }}>
                        <div style={labelStyle}>Modul</div>
                        <select
                          value={moduleFilter}
                          onChange={(e) => setModuleFilter(e.target.value)}
                          style={selectStyle}
                        >
                          {moduleOptions.map((o) => (
                            <option key={o.value} value={o.value} disabled={!!o.disabled}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={summaryPillStyle}>
                        Ukupno: <span style={summaryStrongStyle}>{minutesToHM(totalMinutes)}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={filtersRowStyle}>
                      <div style={fieldStyle}>
                        <div style={labelStyle}>Mjesec</div>
                        <input
                          type="month"
                          value={month}
                          onChange={(e) => setMonth(e.target.value)}
                          style={inputStyle}
                        />
                      </div>

                      <div style={{ ...fieldStyle, minWidth: 240, flex: 1 }}>
                        <div style={labelStyle}>Modul</div>
                        <select
                          value={graphModuleFilter}
                          onChange={(e) => setGraphModuleFilter(e.target.value)}
                          style={selectStyle}
                        >
                          {moduleOptions.map((o) => (
                            <option key={o.value} value={o.value} disabled={!!o.disabled}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={summaryPillStyle}>
                        Ukupno: <span style={summaryStrongStyle}>{minutesToHM(totalMinutes)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {errMsg && <div style={errorStyle}>{errMsg}</div>}

                {loading ? (
                  <div style={loadingStyle}>Učitavanje…</div>
                ) : view === "table" ? (
                  <TableView sessions={sessions} />
                ) : (
                  <GraphView monthCalendar={monthCalendar} isMobile={isMobilePortrait} />
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

function TableView({ sessions }) {
  return (
    <div style={tableWrapStyle}>
      <div style={tableHintStyle}>
        {sessions?.length ? `Prikazano sesija: ${sessions.length}` : "Nema sesija za izabrane filtere."}
      </div>

      <div style={tableScrollStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Datum</th>
              <th style={thStyle}>Početak</th>
              <th style={thStyle}>Završetak</th>
              <th style={thStyle}>Tip</th>
              <th style={thStyle}>Modul</th>
              <th style={thStyleRight}>Trajanje</th>
              <th style={thStyleRight}>Ocjena</th>
            </tr>
          </thead>

          <tbody>
            {sessions?.map((s) => (
              <tr key={s.id} style={trStyle}>
                <td style={tdStyle}>{formatDate(s.start_time)}</td>
                <td style={tdStyle}>{formatDateTime(s.start_time)}</td>
                <td style={tdStyle}>{s.end_time ? formatDateTime(s.end_time) : "—"}</td>
                <td style={tdStyle}>{getModuleType(s)}</td>
                <td style={tdStyle}>{getModuleLabel(s)}</td>
                <td style={tdStyleRight}>{minutesToHM(s.duration_minutes)}</td>
                <td style={tdStyleRight}>{s.grade ?? "—"}</td>
              </tr>
            ))}

            {!sessions?.length && (
              <tr>
                <td style={{ ...tdStyle, padding: 18 }} colSpan={7}>
                  Nema podataka.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GraphView({ monthCalendar, isMobile }) {
  if (!monthCalendar) return <div style={mutedStyle}>Odaberi mjesec.</div>;

  const { cells } = monthCalendar;

  return (
    <div style={graphWrapStyle}>
      <div style={graphLegendRowStyle}>
        <div style={graphLegendTextStyle}>
          Prikaz: ukupan broj minuta po danu (suma svih sesija).
        </div>
        <div style={graphLegendBarStyle}>
          <div style={legendChipStyle}>Manje</div>
          <div style={legendTrackStyle}>
            <div style={legendFillStyle} />
          </div>
          <div style={legendChipStyle}>Više</div>
        </div>
      </div>

      <div style={weekHeaderStyle}>
        {["Pon", "Uto", "Sri", "Čet", "Pet", "Sub", "Ned"].map((d) => (
          <div key={d} style={weekHeaderCellStyle}>
            {d}
          </div>
        ))}
      </div>

      <div style={isMobile ? calendarGridStyleMobile : calendarGridStyle}>
        {cells.map((c) =>
          c.kind === "empty" ? (
            <div key={c.key} style={emptyCellStyle} />
          ) : isMobile ? (
            <div key={c.key} style={dayCellStyleMobile}>
              <div style={dayTopRowStyleMobile}>
                <div style={dayNumberStyleMobile}>{c.day}</div>
              </div>

              <div style={dayBarTrackVerticalStyle}>
                <div
                  style={{
                    ...dayBarFillVerticalStyle,
                    height: `${Math.max(0, Math.min(100, c.intensity * 100))}%`,
                  }}
                />
              </div>

              <div style={dayMinutesStyleMobile}>
                {c.minutes ? `${c.minutes} min` : ""}
              </div>
            </div>
          ) : (
            <div key={c.key} style={dayCellStyle}>
              <div style={dayTopRowStyle}>
                <div style={dayNumberStyle}>{c.day}</div>
                <div style={dayValueStyle}>{c.minutes ? minutesToHM(c.minutes) : ""}</div>
              </div>

              <div style={dayBarTrackStyle}>
                <div
                  style={{
                    ...dayBarFillStyle,
                    width: `${Math.max(0, Math.min(100, c.intensity * 100))}%`,
                  }}
                />
              </div>

              <div style={dayKeyStyle}>{c.key}</div>
            </div>
          )
        )}
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
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const headerActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
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
  maxWidth: 720,
};

const toggleWrapStyle = {
  display: "flex",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 12px 26px rgba(0,0,0,0.10)",
  overflow: "hidden",
};

const toggleBtnStyle = {
  border: "none",
  background: "transparent",
  padding: "10px 12px",
  fontFamily: "Arial, sans-serif",
  fontWeight: 900,
  color: "rgba(11,18,32,0.78)",
  cursor: "pointer",
  minWidth: 92,
};

const toggleBtnActiveStyle = {
  background: "#0B1220",
  color: "white",
};

const btnGhostStyle = {
  border: "1px solid rgba(17,24,39,0.12)",
  background: "transparent",
  padding: "10px 12px",
  borderRadius: 12,
  fontFamily: "Arial, sans-serif",
  fontWeight: 900,
  color: "#0B1220",
  cursor: "pointer",
};

const filtersCardStyle = {
  marginTop: 14,
  borderRadius: 18,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.12)",
  padding: 14,
};

const filtersRowStyle = {
  display: "flex",
  alignItems: "flex-end",
  gap: 12,
  flexWrap: "wrap",
};

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 160,
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

const selectStyle = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.12)",
  fontFamily: "Arial, sans-serif",
  fontWeight: 800,
  outline: "none",
  background: "white",
  boxShadow: "0 12px 26px rgba(0,0,0,0.08)",
};

const summaryPillStyle = {
  marginLeft: "auto",
  padding: "10px 12px",
  borderRadius: 999,
  border: "1px solid rgba(45,189,110,0.24)",
  background: "rgba(45,189,110,0.10)",
  fontWeight: 900,
  color: "rgba(11,18,32,0.84)",
};

const summaryStrongStyle = { color: "#0B1220" };

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

const mutedStyle = {
  marginTop: 12,
  color: "rgba(11,18,32,0.74)",
  fontWeight: 800,
};

const tableWrapStyle = { marginTop: 14 };

const tableHintStyle = {
  marginBottom: 10,
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.72)",
};

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
  minWidth: 880,
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
const thStyleRight = { ...thStyle, textAlign: "right" };

const trStyle = { background: "rgba(255,255,255,0.98)" };

const tdStyle = {
  padding: "12px 12px",
  fontSize: 13,
  fontWeight: 800,
  color: "#0B1220",
  borderBottom: "1px solid rgba(17,24,39,0.06)",
  whiteSpace: "nowrap",
};
const tdStyleRight = { ...tdStyle, textAlign: "right" };

const graphWrapStyle = {
  marginTop: 14,
  borderRadius: 18,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.12)",
  padding: 14,
};

const graphLegendRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 12,
};

const graphLegendTextStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.72)",
};

const graphLegendBarStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const legendChipStyle = {
  fontSize: 11,
  fontWeight: 900,
  color: "rgba(11,18,32,0.70)",
};

const legendTrackStyle = {
  width: 120,
  height: 10,
  borderRadius: 999,
  border: "1px solid rgba(45,189,110,0.28)",
  background: "rgba(45,189,110,0.10)",
  overflow: "hidden",
};

const legendFillStyle = {
  width: "100%",
  height: "100%",
  background: "linear-gradient(90deg, rgba(45,189,110,0.15), rgba(45,189,110,1))",
};

const weekHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 10,
  marginBottom: 8,
};

const weekHeaderCellStyle = {
  fontSize: 11,
  fontWeight: 900,
  color: "rgba(11,18,32,0.70)",
  textAlign: "center",
};

const calendarGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 10,
};

const emptyCellStyle = {
  height: 78,
  borderRadius: 16,
  border: "1px dashed rgba(17,24,39,0.12)",
  background: "rgba(255,255,255,0.80)",
};

const dayCellStyle = {
  height: 78,
  borderRadius: 16,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.98)",
  boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  overflow: "hidden",
};

const dayTopRowStyle = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
};

const dayNumberStyle = {
  fontSize: 13,
  fontWeight: 900,
  color: "#0B1220",
};

const dayValueStyle = {
  fontSize: 11,
  fontWeight: 900,
  color: "rgba(11,18,32,0.68)",
  whiteSpace: "nowrap",
};

const dayBarTrackStyle = {
  height: 10,
  borderRadius: 999,
  border: "1px solid rgba(45,189,110,0.28)",
  background: "rgba(45,189,110,0.10)",
  overflow: "hidden",
};

const dayBarFillStyle = {
  height: "100%",
  borderRadius: 999,
  background: "#2DBD6E",
};

const dayKeyStyle = {
  fontSize: 10,
  fontWeight: 900,
  color: "rgba(11,18,32,0.55)",
};

// Mobile (portrait) compact day cells: vertical bars + minutes below
const calendarGridStyleMobile = {
  ...calendarGridStyle,
  gap: 8,
};

const dayCellStyleMobile = {
  ...dayCellStyle,
  padding: 8,
  height: 90,
  alignItems: "center",
};

const dayTopRowStyleMobile = {
  width: "100%",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const dayNumberStyleMobile = {
  ...dayNumberStyle,
  fontSize: 12,
};

const dayBarTrackVerticalStyle = {
  width: 12,
  height: 40,
  borderRadius: 999,
  border: "1px solid rgba(45,189,110,0.28)",
  background: "rgba(45,189,110,0.10)",
  overflow: "hidden",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
};

const dayBarFillVerticalStyle = {
  width: "100%",
  borderRadius: 999,
  background: "#2DBD6E",
};

const dayMinutesStyleMobile = {
  marginTop: 6,
  fontSize: 10,
  fontWeight: 900,
  color: "rgba(11,18,32,0.70)",
  textAlign: "center",
  minHeight: 14,
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
