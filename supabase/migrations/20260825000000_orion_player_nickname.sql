-- Preserve Orion Stars' optional NickName separately from its required Account.
-- Browser database roles remain covered by the existing table-level revocations.

ALTER TABLE public.sandbox_game_accounts
  ADD COLUMN nickname TEXT;

UPDATE public.sandbox_game_accounts
SET nickname = game_username
WHERE nickname IS NULL;
