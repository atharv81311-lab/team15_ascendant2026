/*
# Create subscriptions table

1. New Tables
- `subscriptions`
  - `id` (uuid, primary key, defaults to gen_random_uuid())
  - `user_id` (uuid, not null, defaults to the authenticated user, references auth.users with ON DELETE CASCADE)
  - `name` (text, not null) — normalized merchant/subscription name
  - `amount` (numeric, not null) — charge amount
  - `frequency` (text, not null, check constraint: 'weekly' | 'monthly' | 'yearly')
  - `still_using` (boolean, not null, default true) — toggle for whether the user still uses the subscription
  - `created_at` (timestamptz, default now())
  - Unique constraint on (user_id, name, amount) so re-uploading the same CSV upserts instead of duplicating.

2. Security
- Enable RLS on `subscriptions`.
- Owner-scoped CRUD: each authenticated user can only SELECT, INSERT, UPDATE, and DELETE their own rows.
- Policies use auth.uid() = user_id for ownership checks.
- user_id defaults to auth.uid() so client inserts that omit user_id still satisfy the WITH CHECK predicate.

3. Notes
- The unique constraint supports Supabase .upsert() with onConflict: 'user_id,name,amount'.
- Estimated annual cost is computed in the frontend (weekly*52, monthly*12, yearly*1).
*/

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  still_using boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, name, amount)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own subscriptions" ON subscriptions;
CREATE POLICY "Users can view their own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON subscriptions;
CREATE POLICY "Users can insert their own subscriptions"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own subscriptions" ON subscriptions;
CREATE POLICY "Users can update their own subscriptions"
  ON subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON subscriptions;
CREATE POLICY "Users can delete their own subscriptions"
  ON subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
