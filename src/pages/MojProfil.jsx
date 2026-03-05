import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { useAuth, markOffline } from "../auth/AuthProvider";
import logoMed from "../assets/logo_medicinski_fakultet.jpg";

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

function dayLetterBosnian(jsDay) {
  // JS: Sun=0..Sat=6
  // Pon, Uto, Sri, Čet, Pet, Sub, Ned => P U S Č P S N
  const map = ["N", "P", "U", "S", "Č", "P", "S"];
  return map[jsDay] || "?";
}
function dayFullBosnian(jsDay) {
  const map = ["Nedjelja", "Ponedjeljak", "Utorak", "Srijeda", "Četvrtak", "Petak", "Subota"];
  return map[jsDay] || "";
}
function localYMD(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
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

function FieldRow({ label, value }) {
  return (
    <div style={fieldRowStyle}>
      <div style={fieldLabelStyle}>{label}</div>
      <div style={fieldValueStyle}>{value ?? "—"}</div>
    </div>
  );
}

export default function MojProfil() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const [profile, setProfile] = useState(null);

  // Inline editor (inside the bottom green box)
  const [editUsername, setEditUsername] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editBirthdate, setEditBirthdate] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    if (!profile) return;
    setEditUsername(profile.username ?? "");
    setEditFirstName(profile.first_name ?? "");
    setEditLastName(profile.last_name ?? "");
    setEditGender(profile.gender ?? "");
    setEditBirthdate(profile.birthdate ? String(profile.birthdate).slice(0, 10) : "");
  }, [profile?.id]);


  // Rolling last 7 days: oldest -> newest
  const [rollingDays, setRollingDays] = useState(() =>
    Array.from({ length: 7 }, (_, i) => ({
      key: `d-${i}`,
      ymd: "",
      label: "",
      full: "",
      minutes: 0,
    }))
  );

  const weeklyBarsWrapRef = useRef(null);
  const [weeklyPopup, setWeeklyPopup] = useState(null);

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
    async function loadProfileAndRollingWeek() {
      if (!user) return;
      setLoading(true);
      setErrMsg("");

      try {
        const { data, error } = await supabase
          .from("users")
          .select(
            "id,role,username,created_at,is_online,last_seen,first_name,last_name,gender,birthdate,email"
          )
          .eq("id", user.id)
          .single();

        if (error) throw error;
        setProfile(data ?? null);

        // Rolling last 7 days (including today), based on start_time
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        start.setDate(start.getDate() - 6);

        const endExclusive = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
          0,
          0,
          0
        );
        endExclusive.setDate(endExclusive.getDate() + 1);

        const { data: sessions, error: se } = await supabase
          .from("sessions")
          .select("start_time,duration_minutes")
          .eq("user_id", user.id)
          .gte("start_time", start.toISOString())
          .lt("start_time", endExclusive.toISOString());

        if (se) throw se;

        const byDay = new Map();
        (sessions ?? []).forEach((s) => {
          const d = new Date(s.start_time);
          const key = localYMD(d);
          byDay.set(key, (byDay.get(key) || 0) + Number(s.duration_minutes || 0));
        });

        const days = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const ymd = localYMD(d);
          const jsDay = d.getDay();
          days.push({
            key: ymd,
            ymd,
            label: dayLetterBosnian(jsDay),
            full: dayFullBosnian(jsDay),
            minutes: byDay.get(ymd) || 0,
          });
        }
        setRollingDays(days);
      } catch (e) {
        setErrMsg(e.message || "Greška pri učitavanju profila.");
      } finally {
        setLoading(false);
      }
    }

    loadProfileAndRollingWeek();
  }, [user?.id]);

  async function logout() {
    if (!user) return;
    await markOffline(user.id);
    await supabase.auth.signOut();
    nav("/login");
  }

async function saveProfileChanges() {
    if (!user) return;
    setSavingProfile(true);
    setErrMsg("");
    setSavedMsg("");

    try {
      const payload = {
        username: editUsername.trim() ? editUsername.trim() : null,
        first_name: editFirstName.trim() ? editFirstName.trim() : null,
        last_name: editLastName.trim() ? editLastName.trim() : null,
        gender: editGender ? editGender : null,
        birthdate: editBirthdate ? editBirthdate : null,
      };

      const { data, error } = await supabase
        .from("users")
        .update(payload)
        .eq("id", user.id)
        .select("id,role,username,created_at,is_online,last_seen,first_name,last_name,gender,birthdate,email")
        .single();

      if (error) throw error;

      setProfile(data ?? null);
      setSavedMsg("Sačuvano.");
      window.setTimeout(() => setSavedMsg(""), 2000);
    } catch (e) {
      setErrMsg(e?.message || "Greška pri spremanju.");
    } finally {
      setSavingProfile(false);
    }
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

  const maxMinutes = useMemo(() => {
    const m = Math.max(1, ...rollingDays.map((d) => Number(d.minutes || 0)));
    return m;
  }, [rollingDays]);
  const weeklyMiniPopupStyle = useMemo(() => {
    if (!weeklyPopup) return null;

    const wrapRect = weeklyBarsWrapRef.current?.getBoundingClientRect();
    const w = wrapRect?.width || 0;

    const left = w
      ? Math.max(10, Math.min(Number(weeklyPopup.x || 0), w - 10))
      : Number(weeklyPopup.x || 0);
    const top = Math.max(10, Number(weeklyPopup.y || 0));

    return {
      ...weeklyMiniPopupBaseStyle,
      ...(isMobilePortrait ? weeklyMiniPopupMobileTweakStyle : null),
      left,
      top,
      transform: "translate(-50%, -100%) translateY(-8px)",
    };
  }, [weeklyPopup, isMobilePortrait]);
  const openWeeklyPopup = (day, e) => {
    if (!day || !weeklyBarsWrapRef.current) return;

    const wrap = weeklyBarsWrapRef.current.getBoundingClientRect();
    const col = e?.currentTarget;
    const colRect = col?.getBoundingClientRect();

    if (!wrap || !colRect) {
      setWeeklyPopup({ minutes: Number(day.minutes || 0), x: 0, y: 0 });
      return;
    }

    const fillEl = col.querySelector('[data-weekly-fill="1"]');
    const trackEl = col.querySelector('[data-weekly-track="1"]');
    const fillRect = fillEl?.getBoundingClientRect();
    const trackRect = trackEl?.getBoundingClientRect();

    const x = colRect.left + colRect.width / 2 - wrap.left;
    const y = (fillRect?.top ?? trackRect?.top ?? colRect.top) - wrap.top;

    setWeeklyPopup({
      minutes: Number(day.minutes || 0),
      x,
      y,
    });
  };
  useEffect(() => {
    if (!weeklyPopup) return;
    const onPointerDown = () => setWeeklyPopup(null);
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [weeklyPopup?.x, weeklyPopup?.y, weeklyPopup?.minutes]);

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
                    <div style={eyebrowStyle}>Profil</div>
                    <div style={titleStyle}>Moj profil</div>
                    
                  </div>
                </div>

                {errMsg && <div style={errorStyle}>{errMsg}</div>}

                {loading ? (
                  <div style={loadingStyle}>Učitavanje…</div>
                ) : (
                  <div style={profileGridStyle}>
                    <div style={sectionCardStyle}>
                      <div style={sectionTitleStyle}>Identitet</div>
                      <FieldRow label="Email" value={profile?.email} />
                      <FieldRow label="Broj indexa" value={profile?.username} />
                      <FieldRow label="Uloga" value={profile?.role} />
                      <FieldRow
                        label="Profil kreiran"
                        value={profile?.created_at ? formatDateTime(profile.created_at) : "—"}
                      />
                    </div>

                    <div style={sectionCardStyle}>
                      <div style={sectionTitleStyle}>Lični podaci</div>
                      <FieldRow label="Ime" value={profile?.first_name} />
                      <FieldRow label="Prezime" value={profile?.last_name} />
                      <FieldRow label="Spol" value={profile?.gender === "female" ? "Žensko" : "Muško"} />
                      <FieldRow
                        label="Datum rođenja"
                        value={profile?.birthdate ? formatDate(profile.birthdate) : "—"}
                      />
                    </div>

                    {/* Rolling weekly chart */}
                    <div style={sectionCardStyle}>
                      <div style={sectionTitleStyle}>Vrijeme učenja posljednjih 7 dana</div>
                      <div style={weeklyHintStyle}>
                        Ukupno vrijeme provedeno učeći po danu.
                      </div>

                      <div ref={weeklyBarsWrapRef} style={weeklyBarsWrapStyle}>
                        {rollingDays.map((d) => {
                          const minutes = Number(d.minutes || 0);
                          const h = Math.max(6, Math.round((minutes / maxMinutes) * 64));
                          const title = `${minutesToHM(minutes)}`;
                          return (
                            <div key={d.key} style={{ ...weeklyColStyle, cursor: "pointer" }} title={title} onClick={(e) => openWeeklyPopup(d, e)}>
                              <div style={weeklyBarTrackStyle} data-weekly-track="1">
                                <div data-weekly-fill="1" style={{ ...weeklyBarFillStyle, height: h }} />
                              </div>
                              <div style={weeklyDayLabelStyle}>{d.label}</div>
                            </div>
                          );
                        })}
                        {weeklyPopup && (
                          <div style={weeklyMiniPopupStyle} aria-hidden="true">
                            {minutesToHM(weeklyPopup.minutes)}
                          </div>
                        )}
</div>

                      <div style={weeklyFooterStyle}>
                        <div style={weeklyFooterLabelStyle}>Maksimalno:</div>
                        <div style={weeklyFooterValueStyle}>{minutesToHM(maxMinutes)}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div style={noteStyle}>
                  <div style={editHeaderRowStyle}>
                    <div style={editHeaderLeftStyle}>
                      <div style={editHeaderTitleStyle}>Uredi profil</div>
                      {savedMsg && <div style={editSavedMsgStyle}>{savedMsg}</div>}
                    </div>

                    <button
                      type="button"
                      onClick={saveProfileChanges}
                      disabled={savingProfile}
                      style={{
                        ...editSaveBtnStyle,
                        ...(savingProfile ? editSaveBtnDisabledStyle : null),
                      }}
                    >
                      {savingProfile ? "..." : "Sačuvaj"}
                    </button>
                  </div>
 
                  <div style={{ ...editGridStyle, ...(isMobilePortrait ? editMobileGridStyle : null) }}>
              
                    <div style={editFieldStyle}>
                      <div style={editLabelStyle}>Ime</div>
                      <input
                        value={editFirstName}
                        onChange={(e) => setEditFirstName(e.target.value)}
                        placeholder="Unesi ime"
                        style={editInputStyle}
                      />
                    </div>

                    <div style={editFieldStyle}>
                      <div style={editLabelStyle}>Prezime</div>
                      <input
                        value={editLastName}
                        onChange={(e) => setEditLastName(e.target.value)}
                        placeholder="Unesi prezime"
                        style={editInputStyle}
                      />
                    </div>

                    <div style={editFieldStyle}>
                      <div style={editLabelStyle}>Spol</div>
                      <select
                        value={editGender}
                        onChange={(e) => setEditGender(e.target.value)}
                        style={editSelectStyle}
                      >
                        <option value="">—</option>
                        <option value="male">Muško</option>
                        <option value="female">Žensko</option>
                      </select>
                    </div>
                    
                    <div style={editFieldStyle}>
                      <div style={editLabelStyle}>Broj indexa</div>
                      <input
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        placeholder="Unesi broj indexa"
                        style={editInputStyle}
                      />
                    </div>

                    <div style={{ ...editFieldStyle, ...editFieldSpan2Style }}>
                      <div style={editLabelStyle}>Datum rođenja</div>
                      <input
                        type="date"
                        value={editBirthdate}
                        onChange={(e) => setEditBirthdate(e.target.value)}
                        style={editInputStyle}
                      />
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

// ----- Styles (match StudentDashboard + MojeSesije) -----

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
};

const profileGridStyle = {
  marginTop: 14,
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
};

const sectionCardStyle = {
  borderRadius: 18,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.12)",
  padding: 14,
};

const sectionTitleStyle = {
  fontSize: 13,
  fontWeight: 900,
  color: "#0B1220",
  letterSpacing: 0.2,
  marginBottom: 10,
};

const fieldRowStyle = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 10,
  padding: "10px 0",
  borderBottom: "1px solid rgba(17,24,39,0.06)",
};

const fieldLabelStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.70)",
};

const fieldValueStyle = {
  fontSize: 13,
  fontWeight: 900,
  color: "#0B1220",
  textAlign: "right",
  maxWidth: 260,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const weeklyHintStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(11,18,32,0.72)",
  marginTop: 2,
  lineHeight: 1.35,
};

const weeklyBarsWrapStyle = {
  marginTop: 12,
  position: "relative",
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 10,
  alignItems: "end",
};

const weeklyColStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
};

const weeklyBarTrackStyle = {
  width: "100%",
  height: 72,
  borderRadius: 16,
  border: "1px solid rgba(45,189,110,0.28)",
  background: "rgba(45,189,110,0.10)",
  display: "flex",
  alignItems: "flex-end",
  overflow: "hidden",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.40)",
};

const weeklyBarFillStyle = {
  width: "100%",
  background: "#2DBD6E",
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
};

const weeklyMiniPopupBaseStyle = {
  position: "absolute",
  zIndex: 8,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(45,189,110,0.14)",
  border: "1px solid rgba(45,189,110,0.24)",
  color: "rgba(11,18,32,0.86)",
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: 0.2,
  boxShadow: "0 14px 34px rgba(0,0,0,0.14)",
  backdropFilter: "blur(8px)",
  whiteSpace: "nowrap",
  pointerEvents: "none",
};

const weeklyMiniPopupMobileTweakStyle = {
  fontSize: 13,
  padding: "7px 12px",
};

const weeklyDayLabelStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.78)",
};

const weeklyFooterStyle = {
  marginTop: 12,
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 10,
  paddingTop: 10,
  borderTop: "1px solid rgba(17,24,39,0.06)",
};

const weeklyFooterLabelStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.68)",
};

const weeklyFooterValueStyle = {
  fontSize: 13,
  fontWeight: 900,
  color: "#0B1220",
};

const weeklyPopupBackdropPcStyle = {
  position: "absolute",
  inset: 0,
  background: "transparent",
  zIndex: 5,
};

const weeklyPopupBackdropMobileStyle = {
  position: "fixed",
  inset: 0,
  background: "transparent",
  zIndex: 200,
};

const weeklyPopupBoxPcBaseStyle = {
  position: "absolute",
  zIndex: 6,
  minWidth: 150,
  maxWidth: 240,
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.14)",
  background: "rgba(255,255,255,0.98)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.20)",
  backdropFilter: "blur(10px)",
  textAlign: "center",
  pointerEvents: "auto",
};

const weeklyPopupBoxMobileStyle = {
  position: "fixed",
  left: "50%",
  bottom: 22,
  transform: "translateX(-50%)",
  zIndex: 201,
  minWidth: 220,
  maxWidth: "calc(100vw - 40px)",
  padding: "12px 14px",
  borderRadius: 18,
  border: "1px solid rgba(17,24,39,0.14)",
  background: "rgba(255,255,255,0.98)",
  boxShadow: "0 22px 60px rgba(0,0,0,0.26)",
  backdropFilter: "blur(10px)",
  textAlign: "center",
};

const weeklyPopupCloseStyle = {
  position: "absolute",
  top: 6,
  right: 8,
  width: 26,
  height: 26,
  borderRadius: 10,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(17,24,39,0.04)",
  color: "rgba(11,18,32,0.78)",
  fontWeight: 900,
  cursor: "pointer",
};

const weeklyPopupTitleStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.72)",
  marginTop: 4,
};

const weeklyPopupTimeStyle = {
  fontSize: 16,
  fontWeight: 900,
  color: "#0B1220",
  marginTop: 2,
};

const loadingStyle = {
  marginTop: 16,
  padding: 18,
  textAlign: "center",
  fontWeight: 900,
  color: "rgba(11,18,32,0.78)",
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

const editHeaderRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
};

const editHeaderLeftStyle = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  flexWrap: "wrap",
};

const editHeaderTitleStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "#0B1220",
  letterSpacing: 0.2,
};

const editSavedMsgStyle = {
  fontSize: 11,
  fontWeight: 900,
  color: "rgba(11,18,32,0.75)",
};

const editGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const editFieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const editLabelStyle = {
  fontSize: 11,
  fontWeight: 900,
  color: "rgba(11,18,32,0.70)",
};

const editInputStyle = {
  height: 36,
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.12)",
  background: "rgba(255,255,255,0.98)",
  padding: "0 12px",
  outline: "none",
  fontSize: 13,
  fontWeight: 800,
  color: "#0B1220",
  boxShadow: "0 8px 22px rgba(0,0,0,0.10)",
};

const editSelectStyle = {
  ...editInputStyle,
  appearance: "none",
};

const editSaveBtnStyle = {
  height: 34,
  borderRadius: 12,
  padding: "0 12px",
  border: "1px solid rgba(17,24,39,0.10)",
  background: "#2DBD6E",
  color: "#FFFFFF",
  fontWeight: 900,
  fontSize: 12,
  cursor: "pointer",
  boxShadow: "0 12px 24px rgba(45,189,110,0.28)",
};

const editSaveBtnDisabledStyle = {
  opacity: 0.75,
  cursor: "not-allowed",
};

const editFieldSpan2Style = {
  gridColumn: "1 / -1",
};

const editMobileGridStyle = {
  gridTemplateColumns: "1fr",
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
