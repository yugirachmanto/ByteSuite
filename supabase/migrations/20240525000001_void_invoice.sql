-- Migration: Add void_invoice function to safely reverse posted invoices
CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id    UUID
) RETURNS VOID AS $$
DECLARE
  v_status          TEXT;
  v_paid_amount     NUMERIC;
  v_outlet_id       UUID;
  line              RECORD;
  v_batch           RECORD;
BEGIN
  -- 1. Get current invoice details and status
  SELECT status, paid_amount, outlet_id INTO v_status, v_paid_amount, v_outlet_id
  FROM invoices WHERE id = p_invoice_id;

  -- 2. Guard: Must be posted to be voided
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  
  IF v_status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted invoices can be voided';
  END IF;

  -- 3. Guard: Cannot void if payments have already been recorded against it
  IF v_paid_amount > 0 THEN
    RAISE EXCEPTION 'Cannot void this invoice because it has already been partially or fully paid (Paid Amount: %)', v_paid_amount;
  END IF;

  -- 4. Guard: Check if any stock has already been consumed
  FOR line IN SELECT id FROM invoice_lines WHERE invoice_id = p_invoice_id AND is_inventory = true
  LOOP
    SELECT id, qty_remaining, original_qty INTO v_batch
    FROM stock_batches WHERE invoice_line_id = line.id;
    
    IF FOUND AND v_batch.qty_remaining < v_batch.original_qty THEN
      RAISE EXCEPTION 'Cannot void this invoice because some of the stock has already been consumed (Remaining: %, Original: %)', v_batch.qty_remaining, v_batch.original_qty;
    END IF;
  END LOOP;

  -- 5. Revert inventory balances
  FOR line IN SELECT item_master_id, qty, total FROM invoice_lines WHERE invoice_id = p_invoice_id AND is_inventory = true AND item_master_id IS NOT NULL
  LOOP
    UPDATE inventory_balance
    SET qty_on_hand     = qty_on_hand - line.qty,
        inventory_value = inventory_value - line.total,
        updated_at      = NOW()
    WHERE outlet_id = v_outlet_id AND item_id = line.item_master_id;
  END LOOP;

  -- 6. Delete stock batches
  DELETE FROM stock_batches
  WHERE invoice_line_id IN (SELECT id FROM invoice_lines WHERE invoice_id = p_invoice_id);

  -- 7. Delete stock ledger entries
  DELETE FROM stock_ledger
  WHERE reference_id = p_invoice_id AND reference_type = 'invoice';

  -- 8. Delete GL entries
  DELETE FROM gl_entries
  WHERE reference_id = p_invoice_id AND reference_type = 'invoice';

  -- 9. Delete invoice lines
  DELETE FROM invoice_lines
  WHERE invoice_id = p_invoice_id;

  -- 10. Revert invoice status back to 'reviewed' and reset audit fields
  UPDATE invoices
  SET status = 'reviewed',
      approved_at = NULL,
      approved_by = NULL,
      payment_status = 'unpaid',
      paid_amount = 0
  WHERE id = p_invoice_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.void_invoice(UUID) TO authenticated;
