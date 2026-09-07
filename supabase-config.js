// Supabase-configuratie voor Werkrooster Kwalitaria Harte Vier.
//
// De sleutel hieronder is de publieke "publishable"/anon-sleutel. Die is bedoeld om
// zichtbaar te zijn in de browser (net als een API-URL) — hij geeft alleen toegang tot
// wat expliciet is toegestaan via de Row Level Security policies in de database.
// Zet hier dus NOOIT een "service_role"-sleutel in, die geeft namelijk volledige
// toegang en mag alleen server-side gebruikt worden.
window.SUPABASE_CONFIG = {
  url: "https://ccravcurgaoxjbyjvaor.supabase.co",
  anonKey: "sb_publishable_knn7ol84m0uZaQhKRyN6vg_X7PkSKI6",
};
