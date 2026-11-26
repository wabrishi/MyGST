-- Payments made to a company on MyGSTBook arrive in its Received inbox.
ALTER TABLE `shared_document` MODIFY `kind` ENUM('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'QUOTATION', 'PURCHASE_ORDER', 'PAYMENT') NOT NULL;
