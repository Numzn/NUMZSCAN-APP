// Supabase configuration for QR Ticket System
// NOTE: Service role key is stored client-side temporarily until auth is implemented.
// Replace placeholders with real values before running in production.

(function initSupabaseConfig() {
  const config = {
    url: "https://db.gbwkrodmicsiashdigad.supabase.co",
    serviceKey: "<SUPABASE_SERVICE_ROLE_KEY>",
    tables: {
      tickets: "tickets",
      ticketScans: "ticket_scans",
    },
  };

  function ensureSupabaseConfig() {
    if (!config.url || config.url.includes("<")) {
      throw new Error("Supabase URL is not configured. Update supabase-config.js.");
    }
    if (!config.serviceKey || config.serviceKey.includes("<")) {
      throw new Error("Supabase service role key is not configured. Update supabase-config.js.");
    }
  }

  function buildHeaders() {
    ensureSupabaseConfig();
    return {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
    };
  }

  window.SupabaseConfig = {
    get url() {
      return config.url;
    },
    get serviceKey() {
      return config.serviceKey;
    },
    get tables() {
      return config.tables;
    },
    get headers() {
      return buildHeaders();
    },
    ensureSupabaseConfig,
  };
})();
