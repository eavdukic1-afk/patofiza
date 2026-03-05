import { useEffect, useRef, useState } from "react";
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

function StepCard({ title, text, bullets }) {
  return (
    <div style={stepCardStyle}>
      <div style={stepTitleStyle}>{title}</div>
      <div style={stepTextStyle}>{text}</div>
      {bullets?.length ? (
        <ul style={stepListStyle}>
          {bullets.map((b, i) => (
            <li key={i} style={stepListItemStyle}>
              {b}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function Uputstva() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);

  const [profile, setProfile] = useState(null);

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
                    <div style={eyebrowStyle}>Kako koristiti</div>
                    <div style={titleStyle}>Uputstva</div>
                    <div style={subtitleStyle}>
                      Kratak vodič kroz aplikaciju i funkcionalnosti.
                    </div>
                  </div>
                </div>

                <div style={stepsGridStyle}>
                  <StepCard
                    title="1) Odabir modula"
                    text="Na početnoj stranici birate teorijski ili praktični modul."
                    bullets={[
                      "Kliknite 'Teorijski moduli' ili 'Praktični moduli'.",
                      "U prozoru odaberite modul.",
                      "Nakon odabira, modul će se pojaviti ispod dugmeta 'Pokreni štopericu'.",
                    ]}
                  />

                  <StepCard
                    title="2) Štoperica"
                    text="Štoperica je namijenjena praćenju vremena učenja."
                    bullets={[
                      "Kliknite 'Start' da započnete sesiju, 'Pauza' da pauzirate sesiju, 'Nastavi' da nastavite sesiju, 'Stop' kada završite.",
                      "Nakon zaustavljanja štoperice unosite ocjenu efektivnosti učenja (5–10).",
                      "Efektivnost učenja mjeri se subjektivnom ocjenom kojom procjenjujete stepen ostvarenja planiranog cilja u toku jedne sesije.",
                      "Sesija se uspješno spašava klikom na dugme 'Sačuvaj'. Ukoliko ste greškom započeli sesiju, dovoljno je da se vratite korak unazad na pregledniku (Browseru) i sesija neće biti spašena."
                    ]}
                  />

                  <StepCard
                    title="3) Moje sesije"
                    text="U pregledu sesija možete vidjeti sve svoje prethodne sesije."
                    bullets={[
                      "Tabelarni prikaz: filtriranje po datumu i modulu.",
                      "Kalendarski prikaz: ukupno vrijeme po danima filtrirano prema mjesecu i modulu.",
                    ]}
                  />

                  <StepCard
                    title="4) Prijava/odjava"
                    text="Web aplikacija koristi Supabase autentifikaciju."
                    bullets={[
                      "Odjavljivanjem korisnika se ažurira online status.",
                      "Ako ste odjavljeni, bit ćete preusmjereni na stranicu za prijavu.",
                      "Nakon dvije minute neaktivnosti bit ćete automatski odjavljeni, osim u slučaju da je prethodno pokrenuta sesija učenja.",
                      "Ukoliko je sesija pokrenuta, nakon 45 min neaktivnosti bit ćete upitani 'Da li još učite?'. Ako u roku od dvije minute Vaš status ne postane aktivan, dolazi do automatske odjave i brisanja započete sesije.",

                    ]}
                  />
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

const stepsGridStyle = {
  marginTop: 14,
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
};

const stepCardStyle = {
  borderRadius: 18,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.12)",
  padding: 14,
};

const stepTitleStyle = {
  fontSize: 13,
  fontWeight: 900,
  color: "#0B1220",
  letterSpacing: 0.2,
  marginBottom: 8,
};

const stepTextStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(11,18,32,0.76)",
  lineHeight: 1.45,
};

const stepListStyle = {
  marginTop: 10,
  paddingLeft: 18,
};

const stepListItemStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(11,18,32,0.76)",
  lineHeight: 1.5,
  marginBottom: 6,
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
