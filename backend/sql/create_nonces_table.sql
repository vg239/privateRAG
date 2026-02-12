-- Create nonces table for wallet authentication
-- This table stores temporary nonces used for wallet-based authentication

CREATE TABLE IF NOT EXISTS public.nonces (
    wallet_address VARCHAR(255) PRIMARY KEY,
    nonce VARCHAR(64) NOT NULL,
    expires_at VARCHAR(50) NOT NULL
);

-- Create an index on expires_at for cleanup queries (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_nonces_expires_at ON public.nonces(expires_at);

-- Grant necessary permissions (adjust based on your Supabase RLS policies)
-- ALTER TABLE public.nonces ENABLE ROW LEVEL SECURITY;

-- Example RLS policy (uncomment and adjust as needed):
-- CREATE POLICY "Allow service role to manage nonces" ON public.nonces
--     FOR ALL USING (auth.role() = 'service_role');
