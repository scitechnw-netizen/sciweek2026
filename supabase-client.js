(() => {
  const cfg = window.TREASURE_CONFIG || {};
  const url = String(cfg.SUPABASE_URL || "").trim();
  const key = String(cfg.SUPABASE_ANON_KEY || "").trim();
  const bad = !url || !key || url.includes("YOUR_PROJECT_REF") || key.includes("YOUR_SUPABASE");
  window.TREASURE_CONFIG_ERROR = bad;
  if (bad) return;
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    window.TREASURE_CONFIG_ERROR = true;
    window.TREASURE_CONFIG_MESSAGE = "โหลด Supabase JavaScript library ไม่สำเร็จ";
    return;
  }
  window.treasureDB = window.supabase.createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-client-info": "science-treasure-hunt/2.0" } }
  });
})();
