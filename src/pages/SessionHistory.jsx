import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthProvider";

export default function SessionHistory() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("sessions")
        .select(`
          id,
          start_time,
          duration_minutes,
          grade,
          theory(name),
          practical(name)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setRows(data ?? []);
    }
    load();
  }, [user.id]);

  return (
    <div style={{ maxWidth: 900, margin: "40px auto" }}>
      <h2>Session History</h2>

      {rows.map((r) => (
        <div key={r.id} style={{ border: "1px solid #ddd", padding: 10, marginBottom: 8 }}>
          <b>{r.theory?.name ?? r.practical?.name}</b>
          <div>{new Date(r.start_time).toLocaleString()}</div>
          <div>{r.duration_minutes} min</div>
          <div>Grade: {r.grade}</div>
        </div>
      ))}
    </div>
  );
}