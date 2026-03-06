import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { markOnline } from "../auth/AuthProvider";

export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showConsent, setShowConsent] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  const signupReady = Boolean(
    termsAccepted &&
      normalizedEmail &&
      normalizedEmail.endsWith("@mf.unsa.ba") &&
      password.trim() &&
      firstName.trim() &&
      lastName.trim() &&
      gender &&
      birthdate
  );
  const isSubmitDisabled = mode === "signup" ? !signupReady : false;

  async function ensureUserRowAfterAuth(user) {
    const userId = user.id;

    // Try to read role (existing user row)
    const { data: roleData, error: roleError } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();

    if (!roleError && roleData?.role) return roleData.role;

    // If there is no row yet, create it now (only after successful auth)
    const missingRow =
      !!roleError &&
      (roleError.code === "PGRST116" ||
        String(roleError.message || "").toLowerCase().includes("no rows") ||
        String(roleError.message || "").toLowerCase().includes("multiple (or no) rows"));

    if (roleError && !missingRow) {
      throw new Error("Greška pri dohvaćanju profila korisnika.");
    }

    const meta = user.user_metadata || {};
    const payload = {
      id: userId,
      email: user.email ?? normalizedEmail,
      first_name: meta.first_name ?? firstName,
      last_name: meta.last_name ?? lastName,
      gender: meta.gender ?? gender,
      birthdate: meta.birthdate ?? birthdate,
      role: meta.role ?? "student",
      is_online: true,
      last_seen: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from("users").insert([payload]);

    if (insertError) throw insertError;

    return payload.role;
  }



  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data?.session?.user;
      if (!alive || !sessionUser) return;

      try {
        const role = await ensureUserRowAfterAuth(sessionUser);
        await markOnline(sessionUser.id);
        nav("/welcome", { state: { role } });
      } catch (err) {
        // If something goes wrong, stay on login and let the user try again.
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ---------------- LOGIN ---------------- */

  async function handleLogin(e) {
    e.preventDefault();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) return alert(error.message);

    const userId = data.user.id;

    try {
      const role = await ensureUserRowAfterAuth(data.user);
      await markOnline(userId);
      nav("/welcome", { state: { role } });
    } catch (err) {
      return alert(err?.message || "Greška pri kreiranju profila korisnika.");
    }
  }

  /* ---------------- SIGNUP ---------------- */

  async function handleSignup(e) {
    e.preventDefault();

    if (!termsAccepted) return alert("Morate prihvatiti informisani pristanak.");

    if (!normalizedEmail.endsWith("@mf.unsa.ba")) {
      return alert("Za registraciju je dozvoljena samo email adresa na domeni @mf.unsa.ba");
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          email: normalizedEmail,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          gender: gender,
          birthdate: birthdate,
          role: "student",
        },
      },
    });

    if (error) return alert(error.message);

    const signedUpUser = data?.user;

    if (!signedUpUser) {
      alert("Registracija uspješna.");
      setMode("login");
      return;
    }

    try {
      const role = await ensureUserRowAfterAuth(signedUpUser);
      await markOnline(signedUpUser.id);
      nav("/welcome", { state: { role } });
    } catch (err) {
      return alert(err?.message || "Greška pri kreiranju profila korisnika.");
    }
  }

  /* ---------------- UI ---------------- */

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0 }}>
            {mode === "login" ? "Dobrodošli nazad" : "Kreirajte nalog"}
          </h2>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            {mode === "login"
              ? "Prijavite se da nastavite"
              : "Unesite podatke za registraciju"}
          </p>
        </div>

        <form
          onSubmit={mode === "login" ? handleLogin : handleSignup}
          style={formStyle}
        >
          {mode === "signup" && (
            <>
              <FloatingInput
                label="Ime"
                value={firstName}
                setValue={setFirstName}
              />

              <FloatingInput
                label="Prezime"
                value={lastName}
                setValue={setLastName}
              />

              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                required
                style={selectStyle}
              >
                <option value="">Odaberite spol</option>
                <option value="male">Muško</option>
                <option value="female">Žensko</option>
              </select>

              <input
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                required
                style={inputStyle}
              />
            </>
          )}

          <FloatingInput
            label="Email"
            value={email}
            setValue={setEmail}
          />

          <FloatingInput
            label="Lozinka"
            value={password}
            setValue={setPassword}
            type="password"
          />

          {mode === "signup" && (
            <div style={termsWrapStyle}>
              <div style={termsBoxStyle}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
                  Izjava o informisanom pristanku
                </p>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#374151", lineHeight: 1.45 }}>
                  Potvrđujem da sam pročitao/la i razumio/la informacije navedene u{" "}
                  <span
                    onClick={() => setShowConsent(true)}
                    style={consentLinkStyle}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setShowConsent(true);
                    }}
                  >
                    Informisanom pristanku za učešće u istraživanju
                  </span>
                  , da sam informisan/a o svrsi prikupljanja i obrade podataka, upoznat/a sa svojim pravima u vezi sa zaštitom
                  ličnih podataka, te da sam saglasan/a da se moji podaci koriste u svrhu ovog istraživanja.
                </p>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#374151", lineHeight: 1.45 }}>
                  Klikom na dugme (ili štrihiranjem) “Prihvatam” potvrđujem svoj informisani pristanak za učešće u istraživanju.
                </p>
              </div>

              <label style={termsCheckStyle}>
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  style={{ marginRight: 10 }}
                />
                Prihvatam
              </label>
            </div>
          )}

          {mode === "signup" && showConsent && (
            <div
              style={modalOverlayStyle}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setShowConsent(false);
              }}
            >
              <div style={modalCardStyle}>
                <div style={modalHeaderStyle}>
                  <div>
                    
                    <div style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }}>
                      Informisani pristanak za učešće u istraživanju
                    </div>
                  </div>
                  <button type="button" onClick={() => setShowConsent(false)} style={modalCloseBtnStyle}>
                    ×
                  </button>
                </div>

                <div style={modalBodyStyle}>
                  <p style={modalPStyle}>
                    <strong>
                      Zašto su studenti na predmetu Patofiziologija 2 opterećeni više nego ECTS – Europski sistem prijenosa i
                      prikupljanja bodova reguliše?
                    </strong>
                  </p>
                  <p style={modalPStyle}>
                    Prije učešća u ovoj studiji važno je da pročitate sljedeće informacije i potvrdite svoj pristanak!
                  </p>
                  <p style={modalPStyle}>
                    Ciljevi ovog istraživanja su da se uporedi broj sati potreban za savladavanje predmeta Patofiziologija 2 u
                    odnosu na predviđeni broj sati ECTS-om, pokušaju utvrditi pojedinačni razlozi za takav odnos i na kraju da se
                    predlože rješenja koja bi eventualno mogla povećati efektivnost i efikasnost studija na istom predmetu kako bi
                    što više odgovarao predviđenom ukupnom broju sati prema ECTS-u.
                  </p>
                  <p style={modalPStyle}>
                    S tim u vezi, u skladu sa Zakonom o zaštiti ličnih podataka (“Sl. glasnik BiH”, br. 12/25) u okviru ovog
                    istraživanja mogu se prikupljati sljedeći podaci:
                  </p>
                  <ul style={modalUlStyle}>
                    <li>osnovni identifikacijski korisnički podaci (ime, prezime, broj indexa i sl.),</li>
                    <li>službena e-mail adresa učesnika na domeni mf.unsa.ba,</li>
                    <li>datum i vrijeme početka i završetka sesije učenja na web-platformi,</li>
                    <li>trajanje sesije učenja,</li>
                    <li>subjektivne ocjene efektivnosti učenja.</li>
                  </ul>
                  <p style={modalPStyle}>
                    Prikupljeni podaci koristit će se isključivo u svrhe naučno-istraživačke analize. Podaci će biti čuvani na
                    zaštićenom serveru, dostupni samo istraživačkom timu, te će u publikacijama biti prikazani isključivo u
                    anonimiziranom ili agregiranom obliku, tako da identitet učesnika ne može biti utvrđen.
                  </p>
                  <p style={modalPStyle}>
                    Učešće u ovom istraživanju je potpuno dobrovoljno. Vaša odluka da učestvujete ili ne učestvujete u
                    istraživanju neće imati nikakav negativan utjecaj na Vaš akademski status, ocjene ili odnos sa nastavnim
                    osobljem. Imate pravo da u bilo kojem trenutku povučete svoj pristanak za učešće u istraživanju i da zatražite
                    prestanak obrade svojih podataka. U tom slučaju, Vaši podaci će biti uklonjeni iz daljnje analize gdje je
                    tehnički moguće.
                  </p>
                  <p style={modalPStyle}>
                    Ukoliko pristupite ovom istraživanju, kolegij predmeta Patofiziologija 2 odobrio je da stičete pravo na
                    dodatna 3 boda na osnovu člana 49. stav (6) Pravila studiranja za prvi i drugi ciklus studija, integrisani,
                    stručni i specijalistički studij na Univerzitetu u Sarajevu (broj: 01-15-24-1/23 od 27. 9. 2023. godine)
                    ukoliko zadovoljite sljedeće uslove:
                  </p>
                  <ul style={modalUlStyle}>
                    <li>na redovnim provjerama znanja imate dovoljan broj bodova da položite predmet i bez dodatna 3 boda,</li>
                    <li>
                      odgovorno i istinito vodite evidenciju, bez obzira na Vaš stil učenja i bez manipulacije ličnih rezultata
                      (kada god i koliko god učite predmet Patofiziologija 2 da započinjete sesije),
                    </li>
                    <li>
                      popunite upitnik koji će biti podijeljen sa Vama na kraju tekućeg semestra u kojem trebate
                      ocijeniti kvalitet literature za teorijski i praktični dio, navesti godinu upisa studija, da li ste 'redovni'
                      ili 'redovni samofinansirajući' student te upisane ocjene na predmetima relevantnim za izučavanje
                      Patofiziologije 2.
                    </li>
                  </ul>
                  <p style={modalPStyle}>
                    Za sva pitanja u vezi sa ovim istraživanjem ili obradom ličnih podataka možete se obratiti istraživačkom timu
                    putem službenog kontakta navedenog na web-platformi.
                  </p>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            style={{
              ...buttonStyle,
              ...(isSubmitDisabled ? disabledButtonStyle : null),
            }}
            disabled={isSubmitDisabled}
          >
            {mode === "login" ? "Prijava" : "Registracija"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 18 }}>
          <button
            onClick={() => {
              const next = mode === "login" ? "signup" : "login";
              setMode(next);
              setTermsAccepted(false);
              setShowConsent(false);
            }}
            style={switchStyle}
          >
            {mode === "login"
              ? "Nemate nalog? Registrujte se"
              : "Imate nalog? Prijavite se"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Floating Input ---------------- */

function FloatingInput({ label, value, setValue, type = "text" }) {
  const isActive = value.length > 0;

  return (
    <div style={{ position: "relative" }}>
      <input
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
        style={{
          ...inputStyle,
          paddingTop: 18,
        }}
      />
      <label
        style={{
          position: "absolute",
          left: 12,
          top: isActive ? 4 : 12,
          fontSize: isActive ? 11 : 14,
          color: isActive ? "#2563eb" : "#9ca3af",
          transition: "0.2s ease",
          pointerEvents: "none",
        }}
      >
        {label}
      </label>
    </div>
  );
}

/* ---------------- Styles ---------------- */

const pageStyle = {
  height: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background:
    "linear-gradient(135deg, #eef2ff 0%, #f3f4f6 100%)",
  fontFamily: "system-ui, sans-serif",
};

const cardStyle = {
  width: 400,
  background: "white",
  padding: 35,
  borderRadius: 20,
  boxShadow: "0 20px 60px rgba(0,0,0,0.08)",
};

const headerStyle = {
  marginBottom: 20,
};

const formStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const inputStyle = {
  width: "100%",
  padding: "12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
};

const selectStyle = {
  padding: "12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
};

const buttonStyle = {
  marginTop: 10,
  padding: "14px",
  borderRadius: 12,
  background: "#111827",
  color: "white",
  border: "none",
  cursor: "pointer",
  fontWeight: 500,
};

const disabledButtonStyle = {
  opacity: 0.55,
  cursor: "not-allowed",
};

const switchStyle = {
  background: "none",
  border: "none",
  color: "#2563eb",
  cursor: "pointer",
  fontSize: 14,
};

const termsWrapStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginTop: 2,
};

const termsBoxStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  maxHeight: 150,
  overflow: "auto",
  background: "#f9fafb",
};

const termsCheckStyle = {
  display: "flex",
  alignItems: "center",
  fontSize: 13,
  color: "#111827",
  userSelect: "none",
};

const consentLinkStyle = {
  color: "#2563eb",
  textDecoration: "underline",
  cursor: "pointer",
  fontWeight: 600,
};

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 16,
  zIndex: 9999,
};

const modalCardStyle = {
  width: "min(720px, 95vw)",
  maxHeight: "85vh",
  background: "white",
  borderRadius: 16,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const modalHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f9fafb",
};

const modalCloseBtnStyle = {
  border: "none",
  background: "transparent",
  fontSize: 24,
  lineHeight: 1,
  cursor: "pointer",
  color: "#111827",
};

const modalBodyStyle = {
  
  paddingTop: 5,
  paddingLeft: 15,
  paddingRight: 15,
  paddingBottom: 5,
  overflow: "auto",
};

const modalPStyle = {
  margin: "10px 0",
  fontSize: 13,
  color: "#111827",
  lineHeight: 1.55,
};

const modalUlStyle = {
  margin: "8px 0 12px -10px",
  fontSize: 13,
  color: "#111827",
  lineHeight: 1.55,
};