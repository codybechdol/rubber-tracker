-- ============================================================================
-- Safety Assistant — Supabase Multi-User Real-Time Database Setup
-- ============================================================================
-- Instructions:
-- 1. Open your Supabase project dashboard (https://supabase.com/dashboard)
-- 2. In the left sidebar, click "SQL Editor" -> "New query"
-- 3. Paste this entire file and click "Run" (or Ctrl+Enter)
-- ============================================================================

-- 1. Table storage: Holds all 52 Safety Assistant tables + __configs__ + __manual_picks__
CREATE TABLE IF NOT EXISTS public.sa_tables (
  table_key   TEXT PRIMARY KEY,
  sheet_name  TEXT NOT NULL,
  headers     JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows        JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_grid    JSONB DEFAULT NULL,
  row_count   INTEGER NOT NULL DEFAULT 0,
  revision    BIGINT NOT NULL DEFAULT 1,
  updated_by  TEXT DEFAULT 'system',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Granular Mutation Stream: Enables multi-user cell/row edits without overwriting each other
CREATE TABLE IF NOT EXISTS public.sa_mutations (
  seq         BIGSERIAL PRIMARY KEY,
  mut_id      TEXT UNIQUE NOT NULL,
  device_id   TEXT NOT NULL,
  device_name TEXT NOT NULL DEFAULT 'Unknown Device',
  action      TEXT NOT NULL,
  table_key   TEXT,
  sheet_name  TEXT,
  mutation    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sa_mutations_seq ON public.sa_mutations (seq);
CREATE INDEX IF NOT EXISTS idx_sa_mutations_created_at ON public.sa_mutations (created_at);

-- 3. Global Revision Counter helper function
CREATE OR REPLACE FUNCTION public.next_sa_revision()
RETURNS BIGINT
LANGUAGE sql
AS $$
  SELECT COALESCE(MAX(revision), 0) + 1 FROM public.sa_tables;
$$;

-- 4. Enable Row Level Security (RLS) with access for the app's anon/authenticated key
ALTER TABLE public.sa_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sa_mutations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to sa_tables" ON public.sa_tables;
CREATE POLICY "Allow full access to sa_tables"
  ON public.sa_tables
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to sa_mutations" ON public.sa_mutations;
CREATE POLICY "Allow full access to sa_mutations"
  ON public.sa_mutations
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Enable Supabase Realtime WebSockets on both tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sa_mutations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sa_mutations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sa_tables'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sa_tables;
  END IF;
END $$;
