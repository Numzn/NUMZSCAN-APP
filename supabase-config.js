// Supabase configuration for QR Ticket System
// NOTE: Service role key is temporarily stored client-side until auth is added.

(function initSupabaseConfig() {
  const config = {
    url: "https://db.gbwkrodmicsiashdigad.supabase.co",
    serviceKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdid2tyb2RtaWNzaWFzaGRpZ2FkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjU4NDE5OCwiZXhwIjoyMDc4MTYwMTk4fQ.edeD1OjrqS3R7kPiiZ_2hc3rkoQ4nzlgWiBJxjR0_kk",
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