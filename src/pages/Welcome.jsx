import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import logo from "../assets/logo.svg";

export default function Welcome() {
  const nav = useNavigate();
  const location = useLocation();
  const role = location.state?.role || "student";

  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFadeOut(true), 4400);
    const t2 = setTimeout(() => {
      nav(role === "admin" ? "/admin" : "/", { replace: true });
    }, 5000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [role, nav]);

  return (
    <div style={{ ...pageStyle, opacity: fadeOut ? 0 : 1 }}>
      <div style={frameStyle}>
        <div style={panelStyle}>
          <div style={contentWrapStyle}>
            <div style={cardStyle}>
              <div style={pillStyle}>Dobrodošli</div>

              <h1 style={titleStyle}>
                Zašto su studenti na predmetu Patofiziologija 2 opterećeni više nego ECTS – Europski
                sistem prijenosa i prikupljanja bodova reguliše?
              </h1>

              <div style={subRowStyle}>
                <div style={subTextStyle}>Pripremamo aplikaciju…</div>
                <div style={subDotWrapStyle} aria-hidden="true">
                  <span style={dotStyle} />
                  <span style={{ ...dotStyle, animationDelay: "0.15s" }} />
                  <span style={{ ...dotStyle, animationDelay: "0.3s" }} />
                </div>
              </div>

              <div style={logoWrapStyle}>
                <img src={logo} alt="logo" style={logoStyle} />
              </div>

              <div style={hintStyle}>Bit ćete automatski preusmjereni.</div>

              <style>{`
                @keyframes logoFloat {
                  0% { transform: translateY(0) scale(1); }
                  50% { transform: translateY(-6px) scale(1.02); }
                  100% { transform: translateY(0) scale(1); }
                }
                @keyframes dotPulse {
                  0%, 80%, 100% { transform: translateY(0); opacity: .55; }
                  40% { transform: translateY(-3px); opacity: 1; }
                }
              `}</style>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- STYLES (match the rest of the app) ---------------- */

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #38C172 0%, #22A85F 100%)",
  padding: 28,
  fontFamily: "Arial, sans-serif",
  transition: "opacity 0.6s ease",
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

const contentWrapStyle = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "18px 18px 20px",
};

const cardStyle = {
  width: "100%",
  maxWidth: 980,
  background: "rgba(255,255,255,0.92)",
  borderRadius: 20,
  border: "1px solid rgba(17,24,39,0.08)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
  padding: "22px 22px 18px",
};

const pillStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(45,189,110,0.14)",
  border: "1px solid rgba(45,189,110,0.24)",
  color: "rgba(11,18,32,0.86)",
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: 0.2,
};

const titleStyle = {
  marginTop: 12,
  fontSize: "clamp(22px, 3.6vw, 36px)",
  fontWeight: 900,
  lineHeight: 1.22,
  color: "#0B1220",
  letterSpacing: "-0.6px",
};

const subRowStyle = {
  marginTop: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const subTextStyle = {
  fontSize: 13,
  fontWeight: 900,
  color: "rgba(11,18,32,0.70)",
};

const subDotWrapStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const dotStyle = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: "#0B1220",
  opacity: 0.55,
  animation: "dotPulse 1s infinite ease-in-out",
};

const logoWrapStyle = {
  marginTop: 18,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const logoStyle = {
  width: 220,
  maxWidth: "70%",
  animation: "logoFloat 2.2s ease-in-out infinite",
  filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.18))",
};

const hintStyle = {
  marginTop: 12,
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.60)",
  textAlign: "center",
};

/* Mobile spacing tweaks (match your existing mobile framing) */
const isSmallScreen = typeof window !== "undefined" && window.matchMedia?.("(max-width: 768px)").matches;
if (isSmallScreen) {
  // keep the same outer border sizing as StudentDashboard on mobile:
  pageStyle.padding = 28;
  frameStyle.padding = 14;
  contentWrapStyle.padding = "18px 18px 20px";
}
