-- Read-only. Run in the application database WHILE requests are blocked.
SELECT VERSION() AS server_version, DATABASE() AS application_database;
SHOW CREATE TABLE loan_sequences;
SHOW INDEX FROM loan_sequences;
SHOW VARIABLES LIKE 'innodb_lock_wait_timeout';
SHOW VARIABLES LIKE 'innodb_rollback_on_timeout';

-- Includes idle connections with open transactions; their trx_query can be NULL.
SELECT trx_id, trx_state, trx_started, trx_wait_started,
       trx_mysql_thread_id, trx_rows_locked, trx_rows_modified, trx_query
FROM information_schema.innodb_trx
ORDER BY trx_started;

-- MySQL 8.x: wait graph, including blocking connection IDs.
-- On MariaDB/MySQL 5.7 use information_schema.innodb_lock_waits instead.
SELECT w.REQUESTING_ENGINE_TRANSACTION_ID AS waiting_transaction,
       r.trx_mysql_thread_id AS waiting_connection,
       r.trx_query AS waiting_query,
       w.BLOCKING_ENGINE_TRANSACTION_ID AS blocking_transaction,
       b.trx_mysql_thread_id AS blocking_connection,
       b.trx_started AS blocking_since,
       b.trx_query AS blocking_query,
       l.OBJECT_SCHEMA, l.OBJECT_NAME, l.INDEX_NAME, l.LOCK_TYPE, l.LOCK_MODE
FROM performance_schema.data_lock_waits w
LEFT JOIN information_schema.innodb_trx r
  ON r.trx_id = w.REQUESTING_ENGINE_TRANSACTION_ID
LEFT JOIN information_schema.innodb_trx b
  ON b.trx_id = w.BLOCKING_ENGINE_TRANSACTION_ID
LEFT JOIN performance_schema.data_locks l
  ON l.ENGINE = w.ENGINE AND l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID;

SHOW ENGINE INNODB STATUS;
