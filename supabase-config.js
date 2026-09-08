// Supabase-configuratie voor de Habit Tracker app.
//
// De URL en de "anon"/publishable key hieronder zijn bedoeld om publiek in
// client-side code te staan (ze zitten ook gewoon in elke request vanuit de
// browser) - de daadwerkelijke beveiliging van de data zit in de Row Level
// Security-policies op de tabellen in de database, niet in het geheimhouden
// van deze key. Zet hier dus nooit een "service_role" key in: die omzeilt RLS
// volledig en hoort alleen server-side thuis.
window.SUPABASE_URL = "https://ccravcurgaoxjbyjvaor.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjcmF2Y3VyZ2FveGpieWp2YW9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3OTYxNTMsImV4cCI6MjEwNDM3MjE1M30.4a3RTUFAOThjBq31EfvLCb9FvSkE6IKcA14TE40z3GE";
