import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const STUDY_FLAG_KEY = "pf2_study_active";
const STUDY_STATE_EVENT = "pf2-study-state";

function setStudyActiveFlag(active) {
  try {
    if (active) localStorage.setItem(STUDY_FLAG_KEY, "1");
    else localStorage.removeItem(STUDY_FLAG_KEY);
    window.dispatchEvent(new Event(STUDY_STATE_EVENT));
  } catch {
    // ignore
  }
}

function format(ms) {
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function Timer() {
  const { subjectId, type } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [startAt, setStartAt] = useState(null);
  const [accMs, setAccMs] = useState(0);
  const [sessionRow, setSessionRow] = useState(null);
  const [tick, setTick] = useState(0);
  const [grade, setGrade] = useState("");

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);

  const elapsed = useMemo(() => {
    if (!running) return 0;
    if (!startAt) return accMs;
    const add = paused ? 0 : Date.now() - startAt;
    return accMs + add;
  }, [running, startAt, paused, accMs, tick]);

  async function startSession() {
    if (!user) return;

    // Prevent starting again during this page lifecycle
    if (sessionRow) return;

    const now = new Date();

    const insertData =
      type === "theory"
        ? { user_id: user.id, theory_id: Number(subjectId), start_time: now }
        : { user_id: user.id, practical_id: Number(subjectId), start_time: now };

    setGrade("");
    setSessionRow(insertData);
    setStudyActiveFlag(true);
    setStartAt(now.getTime());
    setAccMs(0);
    setPaused(false);
    setRunning(true);
  }

  function togglePause() {
    if (!running || !startAt) return;

    if (paused) {
      // Resume
      setStartAt(Date.now());
      setPaused(false);
    } else {
      // Pause: accumulate elapsed so far, then stop counting
      setAccMs((prev) => prev + (Date.now() - startAt));
      setPaused(true);
    }
  }

  async function stopSession() {
    if (!sessionRow || !startAt) return;

    const end = new Date();
    const totalMs = accMs + (paused ? 0 : end.getTime() - startAt);
    const minutes = Math.max(1, Math.round(totalMs / 60000));

    setSessionRow({
      ...sessionRow,
      end_time: end,
      duration_minutes: minutes,
    });
    setRunning(false);
    setPaused(false);
    setAccMs(totalMs);
  }

  async function saveGrade() {
    if (!sessionRow) return;

    const g = Number(grade);

    // Limit grades to 5–10 (inclusive)
    if (!Number.isFinite(g) || g < 5 || g > 10) {
      alert("Ocjena mora biti između 5 i 10.");
      return;
    }

    const { error } = await supabase
      .from("sessions")
      .insert([
        {
          ...sessionRow,
          grade: g,
        },
      ]);

    if (error) return alert(error.message);

    setStudyActiveFlag(false);

    // Go back to StudentDashboard (previous page)
    nav(-1);
  }

  const ended = !!sessionRow?.end_time;
  const timerText = format(elapsed);

  const startDisabled = running || !user || !!sessionRow;
  const stopDisabled = !running;
  const pauseDisabled = !running;

  return (
    <div style={pageStyle}>
      <style>
        {`
          @keyframes glowPulse {
            0% { transform: translateY(0px); box-shadow: 0 18px 44px rgba(0,0,0,0.18); }
            50% { transform: translateY(-1px); box-shadow: 0 26px 70px rgba(0,0,0,0.22); }
            100% { transform: translateY(0px); box-shadow: 0 18px 44px rgba(0,0,0,0.18); }
          }
          @keyframes ringPulse {
            0% { opacity: 0.55; transform: translate(-50%, -50%) scale(1); }
            50% { opacity: 0.25; transform: translate(-50%, -50%) scale(1.035); }
            100% { opacity: 0.55; transform: translate(-50%, -50%) scale(1); }
          }
        `}
      </style>

      <div style={frameStyle}>
        <div style={panelStyle}>
          <div style={cardStyle}>
            <div style={headerStyle}>
              <div style={eyebrowStyle}>Štoperica</div>
              <h1 style={titleStyle}>Vrijeme učenja</h1>
              <div style={subtitleStyle}>
                {running
                  ? paused
                    ? "Sesija je pauzirana — nastavite kada budete spremni."
                    : "Sesija je aktivna — radite fokusirano."
                  : ended
                    ? "Sesija završena — unesite ocjenu i sačuvajte."
                    : "Kliknite Start da pokrenete sesiju."}
              </div>
            </div>

            {/* Stage wrapper: circle behind timer AND grading box. Circle size stays the same. */}
            <div style={stageWrapStyle}>
              
              <div style={timerWrapStyle}>
                <div
                  style={{
                    ...timerBoxStyle,
                    animation: running ? "glowPulse 1.8s ease-in-out infinite" : "none",
                  }}
                  aria-label={`Elapsed time ${timerText}`}
                >
                  <div style={timerStyle}>{timerText}</div>
                </div>
              </div>

              <div style={btnRowStyle}>
                <button
                  onClick={startSession}
                  disabled={startDisabled}
                  style={{
                    ...btnStyle,
                    ...btnPrimaryStyle,
                    opacity: startDisabled ? 0.45 : 1,
                    cursor: startDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  Start
                </button>

                <button
                  onClick={togglePause}
                  disabled={pauseDisabled}
                  style={{
                    ...btnStyle,
                    ...btnPauseStyle,
                    opacity: pauseDisabled ? 0.45 : 1,
                    cursor: pauseDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  {paused ? "Nastavi" : "Pauza"}
                </button>

                <button
                  onClick={stopSession}
                  disabled={stopDisabled}
                  style={{
                    ...btnStyle,
                    ...btnDangerStyle,
                    opacity: stopDisabled ? 0.45 : 1,
                    cursor: stopDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  Stop
                </button>
              </div>

              {ended && (
                <div style={resultCardStyle}>
                  <div style={resultTitleStyle}>Rezultat sesije</div>
      
                  <div style={resultGridStyle}>
                    <div style={resultItemStyle}>
                      <div style={resultLabelStyle}>Trajanje</div>
                      <div style={resultValueStyle}>{sessionRow.duration_minutes} min</div>
                    </div>

                    <div style={resultItemStyle}>
                      <div style={resultLabelStyle}>Tip</div>
                      <div style={resultValueStyle}>
                        {type === "theory" ? "Teorijski" : "Praktični"}
                      </div>
                    </div>
                  </div>
                  <div style={resultHintStyle}>Efektivnost učenja mjeri se subjektivnom ocjenom (5-10) kojom procjenjujete stepen ostvarenja planiranog cilja u toku jedne sesije.</div>
                  <div style={gradeRowStyle}>
                    <input
                      type="number"
                      placeholder="Ocjena efektivnosti učenja (5–10)"
                      value={grade}
                      min="5"
                      max="10"
                      step="1"
                      onChange={(e) => setGrade(e.target.value)}
                      style={gradeInputStyle}
                    />

                    <button
                      onClick={saveGrade}
                      disabled={grade.trim() === ""}
                      style={{
                        ...btnStyle,
                        ...btnPrimaryStyle,
                        padding: "12px 16px",
                        opacity: grade.trim() === "" ? 0.45 : 1,
                        cursor: grade.trim() === "" ? "not-allowed" : "pointer",
                        width: 160,
                      }}
                    >
                      Sačuvaj
                    </button>
                  </div>
                  <div style={resultHintStyle}>Nakon spremanja bit ćete vraćeni na početnu stranicu.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- Styles (match StudentDashboard look; no navigation here) -----

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
  alignItems: "center",
  justifyContent: "center",
  padding: 18,
  overflow: "hidden",
};

const cardStyle = {
  width: "100%",
  maxWidth: 840,
  background: "rgba(255,255,255,0.92)",
  borderRadius: 20,
  border: "1px solid rgba(17,24,39,0.08)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
  padding: "22px 18px 18px",
};

const headerStyle = {
  textAlign: "center",
  padding: "8px 6px 10px",
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
  margin: "10px 0 0",
  fontSize: 44,
  letterSpacing: -0.4,
  color: "#0B1220",
  fontWeight: 900,
};

const subtitleStyle = {
  marginTop: 8,
  fontSize: 14,
  fontWeight: 800,
  color: "rgba(11,18,32,0.74)",
};

const stageWrapStyle = {
  position: "relative",
  padding: "6px 0 2px",
};

const stageRingStyle = {
  position: "absolute",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(520px, 92vw)",
  height: "min(520px, 92vw)",
  borderRadius: 999,
  border: "2px solid rgba(255,255,255,0.32)",
  boxShadow: "inset 0 0 0 12px #2DBD6E",
  pointerEvents: "none",
  zIndex: 0,
  opacity: 0.55,
};

const timerWrapStyle = {
  position: "relative",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "22px 10px 10px",
  zIndex: 1,
};

const timerBoxStyle = {
  width: "min(640px, 100%)",
  borderRadius: 22,
  padding: "18px 14px",
  border: "1px solid rgba(17,24,39,0.08)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
  position: "relative",
  zIndex: 1,
};

const timerStyle = {
  fontSize: "clamp(44px, 9vw, 110px)",
  fontWeight: 900,
  color: "#0B1220",
  letterSpacing: 2,
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
};

const btnRowStyle = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  gap: 12,
  justifyContent: "center",
  padding: "16px 6px 6px",
  flexWrap: "wrap",
};

const btnStyle = {
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.14)",
  fontFamily: "Arial, sans-serif",
  fontWeight: 900,
  letterSpacing: 0.2,
  fontSize: 16,
  padding: "14px 22px",
  minWidth: 160,
  boxShadow: "0 16px 32px rgba(0,0,0,0.14)",
};

const btnPrimaryStyle = {
  background: "#0B1220",
  color: "white",
};

const btnPauseStyle = {
  background: "#111827",
  color: "white",
  border: "1px solid rgba(17,24,39,0.22)",
  boxShadow: "0 16px 32px rgba(0,0,0,0.16)",
};

const btnDangerStyle = {
  background: "#B91C1C",
  color: "white",
  border: "1px solid rgba(185, 28, 28, 0.35)",
  boxShadow: "0 16px 32px rgba(185,28,28,0.22)",
};

const resultCardStyle = {
  position: "relative",
  zIndex: 1,
  marginTop: 14,
  borderRadius: 18,
  border: "1px solid rgba(17,24,39,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.12)",
  padding: 16,
};

const resultTitleStyle = {
  fontSize: 14,
  fontWeight: 900,
  color: "#0B1220",
  letterSpacing: 0.2,
};

const resultGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
  marginTop: 12,
};

const resultItemStyle = {
  borderRadius: 14,
  padding: 12,
  border: "1px solid rgba(17,24,39,0.08)",
  background: "rgba(45,189,110,0.14)",
};

const resultLabelStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(11,18,32,0.70)",
};

const resultValueStyle = {
  marginTop: 6,
  fontSize: 20,
  fontWeight: 900,
  color: "#0B1220",
  letterSpacing: -0.2,
};

const gradeRowStyle = {
  marginTop: 12,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  justifyContent: "center",
  alignItems: "center",
};

const gradeInputStyle = {
  width: 240,
  maxWidth: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.12)",
  fontFamily: "Arial, sans-serif",
  fontWeight: 800,
  outline: "none",
  boxShadow: "0 12px 26px rgba(0,0,0,0.10)",
};

const resultHintStyle = {
  marginTop: 10,
  textAlign: "center",
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(11,18,32,0.68)",
};
