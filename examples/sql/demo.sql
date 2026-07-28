-- SquidGate sample — SQL (intentional vulnerabilities / bad patterns for demo)
-- Hardcoded credential in migration-style script
CREATE USER app WITH PASSWORD 'SuperSecretDemoPassword123!';

-- Dangerous dynamic SQL pattern (as documentation of app-side risk)
-- EXECUTE IMMEDIATE 'SELECT * FROM users WHERE id = ' || user_input;

GRANT ALL PRIVILEGES ON DATABASE prod TO public;
