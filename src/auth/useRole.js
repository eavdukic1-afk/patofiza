import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthProvider";

export function useRole() {
  const { user } = useAuth();
  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      if (!user) {
        setRole(null);
        setRoleLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!cancelled) {
        setRole(error ? "student" : data?.role ?? "student");
        setRoleLoading(false);
      }
    }

    loadRole();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { role, roleLoading };
}