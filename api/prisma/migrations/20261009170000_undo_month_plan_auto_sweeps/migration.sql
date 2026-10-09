-- Undo mistaken Month plan auto-sweeps: delete paired Wallet transfer txs
-- so Current / Savings balances return to pre-auto-move state.
DELETE FROM "Transaction"
WHERE note LIKE 'Month plan ·%';

-- Reset soft-limit sweep counters (feature removed; keep columns inert).
UPDATE "MonthSoftLimit"
SET "autoSweptAmount" = 0,
    "autoSweepDone" = true;
