import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL(
    '../../../supabase/migrations/20260925000000_golden_dragon_purchase_entries_only.sql',
    import.meta.url
  ),
  'utf8'
);

test('Golden Dragon purchases do not raise the account balance', () => {
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.recharge_sandbox_game_account/i
  );
  assert.match(
    sql,
    /IF v_account\.game <> 'Golden Dragon' THEN\s*UPDATE public\.sandbox_game_accounts\s*SET balance = balance \+ p_amount[\s\S]*?END IF;/i
  );
  assert.equal(
    sql.match(/SET balance = balance \+ p_amount/gi)?.length,
    1
  );
});

test('Golden Dragon purchases still debit the wallet and record entries', () => {
  assert.match(sql, /FOR UPDATE/i);
  assert.match(
    sql,
    /UPDATE public\.sandbox_game_wallets\s*SET balance = balance - p_amount/i
  );
  assert.match(
    sql,
    /INSERT INTO public\.sandbox_game_history[\s\S]*'GAME ADD CREDITS'/i
  );
  assert.match(sql, /Insufficient game loading balance/);
});
