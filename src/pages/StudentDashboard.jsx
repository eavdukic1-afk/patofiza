import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { useAuth, markOffline } from "../auth/AuthProvider";
import logoMed from "../assets/logo_medicinski_fakultet.jpg";

export default function StudentDashboard() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [profile, setProfile] = useState(null);
  const [theory, setTheory] = useState([]);
  const [practical, setPractical] = useState([]);
  const [modalType, setModalType] = useState(null);
  const [selected, setSelected] = useState(null);

  // Mobile portrait layout ("phone vertical")
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);

  // Mobile dropdown menu
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);

  // For positioning the headline exactly halfway between the nav strip and the subhead line
  const navStripRef = useRef(null);
  const heroWrapRef = useRef(null);
  const subheadRef = useRef(null);
  const headlineAbsRef = useRef(null);
  const [headlineTopPx, setHeadlineTopPx] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px) and (orientation: portrait)");

    const apply = () => setIsMobilePortrait(!!mq.matches);
    apply();

    // Safari < 14 fallback
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else mq.addListener(apply);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else mq.removeListener(apply);
    };
  }, []);

  // Close mobile menu when switching out of mobile portrait
  useEffect(() => {
    if (!isMobilePortrait) setIsMenuOpen(false);
  }, [isMobilePortrait]);

  // Esc to close mobile menu and modal
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
        setModalType(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Position the headline exactly halfway between:
  // - the bottom of the top navigation strip (PC) / mobile header (phone)
  // - and the top of the subhead line ("Odaberi modul, zatim pokreni štopericu.")
  // Works for both PC and mobile layouts.
  useLayoutEffect(() => {
    const measure = () => {
      const navEl = navStripRef.current;
      const heroEl = heroWrapRef.current;
      const subEl = subheadRef.current;
      const hEl = headlineAbsRef.current;

      if (!navEl || !heroEl || !subEl || !hEl) return;

      const navRect = navEl.getBoundingClientRect();
      const heroRect = heroEl.getBoundingClientRect();
      const subRect = subEl.getBoundingClientRect();
      const hRect = hEl.getBoundingClientRect();

      // Desired center Y of the headline in viewport coordinates
      const desiredCenterY = (navRect.bottom + subRect.top) / 2;

      // Clamp so it never overlaps the nav or the subhead
      const padding = 10;
      const minCenterY = navRect.bottom + hRect.height / 2 + padding;
      const maxCenterY = subRect.top - hRect.height / 2 - padding;

      const finalCenterY =
        Number.isFinite(minCenterY) && Number.isFinite(maxCenterY)
          ? Math.max(minCenterY, Math.min(desiredCenterY, maxCenterY))
          : desiredCenterY;

      // Convert viewport Y to hero-local Y (px)
      setHeadlineTopPx(finalCenterY - heroRect.top);
    };

    // Run after layout settles
    let raf1 = 0;
    let raf2 = 0;

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure);
    });

    window.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("resize", measure);
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [isMobilePortrait, isMenuOpen, modalType, profile?.first_name, profile?.gender]);

  useEffect(() => {
    async function loadProfile() {
      const { data } = await supabase
        .from("users")
        .select("first_name, gender")
        .eq("id", user.id)
        .single();
      setProfile(data);
    }

    async function loadSubjects() {
      const { data: t } = await supabase.from("theory").select("*").order("name");
      const { data: p } = await supabase.from("practical").select("*").order("name");
      setTheory(t ?? []);
      setPractical(p ?? []);
    }

    if (user) {
      loadProfile();
      loadSubjects();
    }
  }, [user?.id]);

  async function logout() {
    await markOffline(user.id);
    await supabase.auth.signOut();
    nav("/login");
  }

  function startTimer() {
    if (!selected) return;
    nav(`/timer/${selected.type}/${selected.id}`);
  }

  const greetingWord = profile?.gender === "female" ? "Dobrodošla" : "Dobrodošao";
  const firstName = profile?.first_name ?? "";

  // PC greeting (now includes comma after Dobrodošao/Dobrodošla)
  const greeting =
    profile &&
    `${profile.gender === "female" ? "Dobrodošla" : "Dobrodošao"}, ${profile.first_name}!`;

  const styles = useMemo(() => {
    // IMPORTANT: PC styles stay exactly the same. Only apply changes when isMobilePortrait === true.
    return {
      page: {
        ...pageStyle,
        ...(isMobilePortrait ? { padding: 18 } : null),
      },
      panel: {
        ...panelStyle,
      },
      contentWrap: {
        ...contentWrapStyle,
        ...(isMobilePortrait ? { padding: "10px 14px 18px" } : null),
      },
      contentInner: {
        ...contentInnerStyle,
        ...(isMobilePortrait ? { maxWidth: 720 } : null),
      },
      headline: {
        ...headlineStyle,
        ...(isMobilePortrait ? { fontSize: 34 } : null),
      },
      cardsGrid: {
        ...cardsGridStyle,
        ...(isMobilePortrait
          ? {
              gridTemplateColumns: "1fr",
              gap: 18,
            }
          : null),
      },
      hint: {
        ...hintStyle,
        ...(isMobilePortrait ? { paddingLeft: 8, paddingRight: 8 } : null),
      },
      topNav: {
        ...topNavStyle,
        ...(modalType ? { pointerEvents: "none" } : null),
      },
      mobileHeader: {
        ...mobileHeaderWrapStyle,
        ...(modalType ? { pointerEvents: "none" } : null),
      },
    };
  }, [isMobilePortrait, modalType]);

  const frameBlur = modalType ? "blur(5px)" : "none";

  const subhead = isMobilePortrait
    ? "Odaberite modul, zatim pokrenite štopericu."
    : "Odaberite modul, zatim pokrenite štopericu.";

  const go = (path) => {
    setIsMenuOpen(false);
    nav(path);
  };

  return (
    <>
      <div style={styles.page}>
        <div style={{ ...frameStyle, filter: frameBlur }}>
          <div style={styles.panel}>
            {/* NAVIGATION */}
            {!isMobilePortrait ? (
              // PC / tablet / landscape: top bar
              <div ref={navStripRef} style={styles.topNav}>
                <div style={brandStyle}>
                  <img
                    src={logoMed}
                    alt="Medicinski fakultet"
                    style={brandLogoStyle}
                  />
                  <div style={{ lineHeight: 1.1 }}>
                    {/* renamed from Student portal -> Student */}
                    <div style={brandTitleStyle}>Student</div>
                    <div style={brandSubtitleStyle}>{greeting}</div>
                  </div>
                </div>

                <div style={navLinksRowStyle}>
                  <NavLink label="Moj profil" onClick={() => nav("/profil")} />
                  <NavLink label="Moje sesije" onClick={() => nav("/sesije")} />
                  <NavLink label="Uputstva" onClick={() => nav("/uputstva")} />
                  <NavLink label="Kontakt" onClick={() => nav("/kontakt")} />
                </div>

                {/* PC logout matches the red mobile logout style */}
                <button onClick={logout} style={logoutBtnStyle}>
                  Odjavite se
                </button>
              </div>
            ) : (
              // Phone portrait: top-left menu button + dropdown
              <div ref={navStripRef} style={styles.mobileHeader}>
                <div style={{ position: "relative" }}>
                  <button
                    ref={menuBtnRef}
                    type="button"
                    onClick={() => setIsMenuOpen((v) => !v)}
                    style={mobileMenuButtonStyle}
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                  >
                    <img
                      src={logoMed}
                      alt="Medicinski fakultet"
                      style={brandLogoMobileStyle}
                    />

                    <div style={{ minWidth: 0, textAlign: "left" }}>
                      <div style={mobileMenuTitleStyle}>Student</div>
                      <div style={mobileMenuSubRowStyle}>
                        {/* comma after Dobrodošao/Dobrodošla */}
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

            {/* MAIN CONTENT */}
            <div style={styles.contentWrap}>
              <div style={styles.contentInner}>
                <div
                  ref={heroWrapRef}
                  style={{
                    ...headlineWrapStyle,
                    position: "relative",
                  }}
                >
                  {/* Placeholder keeps original spacing; actual headline is absolutely positioned */}
                  <h1
                    style={{
                      ...styles.headline,
                      visibility: "hidden",
                    }}
                    aria-hidden="true"
                  >
                    PATOFIZIOLOGIJA 2
                  </h1>

                  <div ref={subheadRef} style={subheadStyle}>
                    {subhead}
                  </div>

                  <h1
                    ref={headlineAbsRef}
                    style={{
                      ...styles.headline,
                      position: "absolute",
                      left: "50%",
                      top: headlineTopPx ?? "50%",
                      transform: "translate(-50%, -50%)",
                      width: "100%",
                      margin: 0,
                    }}
                  >
                    PATOFIZIOLOGIJA 2
                  </h1>
                </div>

                <div style={styles.cardsGrid}>
                  <TitleBox
                    title="Teorijski moduli"
                    compact={isMobilePortrait}
                    onClick={() => setModalType("theory")}
                  />
                  <TitleBox
                    title="Praktični moduli"
                    compact={isMobilePortrait}
                    onClick={() => setModalType("practical")}
                  />
                </div>

                <div style={{ textAlign: "center", marginTop: 28 }}>
                  <button
                    onClick={startTimer}
                    disabled={!selected}
                    style={{
                      ...startBtnStyle,
                      ...(isMobilePortrait ? { width: "100%", maxWidth: 360 } : null),
                      opacity: selected ? 1 : 0.45,
                      cursor: selected ? "pointer" : "not-allowed",
                    }}
                  >
                    Pokreni štopericu
                  </button>

                  <div style={styles.hint}>
                    {selected
                      ? `Odabrano: ${selected.name}`
                      : "Nije odabran nijedan modul."}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile blur backdrop when dropdown menu is open */}
      {isMobilePortrait && isMenuOpen && (
        <div
          style={menuBackdropStyle}
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Redesigned module popup */}
      {modalType && (
        <Modal
          title={modalType === "theory" ? "Teorijski moduli" : "Praktični moduli"}
          subjects={modalType === "theory" ? theory : practical}
          type={modalType}
          onClose={() => setModalType(null)}
          onSelect={(subject) => {
            setSelected(subject);
            setModalType(null);
          }}
        />
      )}
    </>
  );
}

function TitleBox({ title, onClick, compact }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: compact ? 30 : 56,
        borderRadius: 18,
        background: "rgba(255,255,255,0.92)",
        textAlign: "center",
        fontFamily: "Arial, sans-serif",
        fontSize: compact ? 18 : 22,
        fontWeight: 700,
        color: "#0B1220",
        cursor: "pointer",
        boxShadow: "0 12px 34px rgba(0,0,0,0.14)",
        border: "1px solid rgba(17,24,39,0.06)",
        transition: "transform 120ms ease, box-shadow 120ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 16px 44px rgba(0,0,0,0.18)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0px)";
        e.currentTarget.style.boxShadow = "0 12px 34px rgba(0,0,0,0.14)";
      }}
    >
      {title}
    </div>
  );
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
        e.currentTarget.style.background = danger
          ? "#A21616"
          : "rgba(17,24,39,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = baseBg;
      }}
    >
      {label}
    </button>
  );
}

function Modal({ title, subjects, type, onClose, onSelect }) {
  return (
    <div
      style={overlayStyle}
      onMouseDown={onClose}
      role="presentation"
      aria-hidden="true"
    >
      <div
        style={modalStyle}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={modalHeaderStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={modalTitleStyle}>{title}</div>
            <div style={modalSubtitleStyle}>Kliknite modul da ga odaberete.</div>
          </div>

          <button type="button" onClick={onClose} style={modalCloseBtnStyle}>
            ✕
          </button>
        </div>

        <div style={modalBodyStyle}>
          {subjects?.length ? (
            subjects.map((s) => {
              const label = s.description ?? s.name ?? "";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect({ id: s.id, name: label, type })}
                  style={modalItemStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 14px 30px rgba(0,0,0,0.14)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0px)";
                    e.currentTarget.style.boxShadow = "0 10px 22px rgba(0,0,0,0.10)";
                  }}
                >
                  <span style={modalItemDotStyle} aria-hidden="true" />
                  <span style={modalItemTextStyle}>{label}</span>
                </button>
              );
            })
          ) : (
            <div style={modalEmptyStyle}>Nema dostupnih modula.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Styles ----------

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

// PC top nav
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

// Phone portrait header (top-left)
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
  fontFamily: "Arial, sans-serif",
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
  fontFamily: "Arial, sans-serif",
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
  fontFamily: "Arial, sans-serif",
};

// PC logout now red (matches mobile logout)
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
  fontFamily: "Arial, sans-serif",
};

const contentWrapStyle = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "18px 22px 26px",
};

const contentInnerStyle = {
  width: "100%",
  maxWidth: 980,
};

const headlineWrapStyle = {
  textAlign: "center",
  marginBottom: 22,
};

const headlineStyle = {
  margin: 0,
  fontSize: 60,
  letterSpacing: -0.4,
  color: "#FFFFFF",
  fontWeight: 900,
  fontFamily: "Arial, sans-serif",
  textShadow: "3px 3px 8px #20714c",
};

const subheadStyle = {
  marginTop: 8,
  fontSize: 16,
  fontWeight: 700,
  color: "rgba(11,18,32,0.78)",
  fontFamily: "Arial, sans-serif",
};

const cardsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 34,
  alignItems: "stretch",
};

const startBtnStyle = {
  padding: "14px 46px",
  background: "#0B1220",
  color: "white",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  fontFamily: "Arial, sans-serif",
  fontWeight: 900,
  letterSpacing: 0.2,
  fontSize: 16,
  boxShadow: "0 16px 32px rgba(0,0,0,0.18)",
};

const hintStyle = {
  marginTop: 10,
  fontSize: 16,
  fontWeight: 700,
  color: "rgba(255,255,255,0.9)",
  textShadow: "3px 3px 8px #20714c",
  fontFamily: "Arial, sans-serif",
};

// Mobile menu button + dropdown
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
  fontFamily: "Arial, sans-serif",
};

const mobileMenuTitleStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "#0B1220",
  letterSpacing: 0.2,
  fontFamily: "Arial, sans-serif",
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
  fontFamily: "Arial, sans-serif",
};

const mobileMenuNameStyle = {
  fontSize: 11,
  fontWeight: 900,
  color: "#0B1220",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 150,
  fontFamily: "Arial, sans-serif",
};

const mobileCaretWrapStyle = {
  marginLeft: "auto",
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.7)",
  paddingLeft: 6,
  fontFamily: "Arial, sans-serif",
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
  fontFamily: "Arial, sans-serif",
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

// Redesigned modal (font now matches the rest of the page)
const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,24,39,0.30)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 18,
  zIndex: 200,
};

const modalStyle = {
  width: "100%",
  maxWidth: 560,
  maxHeight: "72vh",
  overflowY: "auto",
  background: "rgba(255,255,255,0.97)",
  padding: 16,
  borderRadius: 18,
  border: "1px solid rgba(17,24,39,0.10)",
  boxShadow: "0 26px 80px rgba(0,0,0,0.22)",
  fontFamily: "Arial, sans-serif",
};

const modalHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 12px",
  borderRadius: 14,
  background: "rgba(45,189,110,0.12)",
  border: "1px solid rgba(45,189,110,0.22)",
};

const modalTitleStyle = {
  fontFamily: "Arial, sans-serif",
  fontSize: 18,
  fontWeight: 900,
  color: "#0B1220",
  letterSpacing: -0.2,
};

const modalSubtitleStyle = {
  fontFamily: "Arial, sans-serif",
  marginTop: 3,
  fontSize: 12,
  fontWeight: 700,
  color: "rgba(11,18,32,0.70)",
};

const modalCloseBtnStyle = {
  width: 36,
  height: 36,
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.12)",
  background: "rgba(255,255,255,0.92)",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
  fontFamily: "Arial, sans-serif",
};

const modalBodyStyle = {
  padding: "14px 2px 2px",
  display: "grid",
  gap: 10,
};

const modalItemStyle = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  textAlign: "left",
  padding: "12px 12px",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.98)",
  cursor: "pointer",
  fontFamily: "Arial, sans-serif",
  boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
  transition: "transform 120ms ease, box-shadow 120ms ease",
};

const modalItemDotStyle = {
  width: 10,
  height: 10,
  borderRadius: 999,
  background: "#2DBD6E",
  boxShadow: "0 6px 14px rgba(45,189,110,0.35)",
  flex: "0 0 auto",
};

const modalItemTextStyle = {
  fontFamily: "Arial, sans-serif",
  fontWeight: 900,
  color: "#0B1220",
  fontSize: 13,
  lineHeight: 1.2,
};

const modalEmptyStyle = {
  padding: 14,
  borderRadius: 14,
  border: "1px dashed rgba(17,24,39,0.20)",
  background: "rgba(255,255,255,0.85)",
  color: "rgba(11,18,32,0.75)",
  fontWeight: 800,
  textAlign: "center",
  fontFamily: "Arial, sans-serif",
};
