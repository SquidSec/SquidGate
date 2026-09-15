-- SquidGate sample — Lua (intentional vulnerabilities for demo)
local API_KEY = "lua-demo-secret-key-not-real"

local function find_user(id)
  -- SQL injection
  return "SELECT * FROM users WHERE id = '" .. id .. "'"
end

local function run_cmd(name)
  -- command injection
  os.execute("echo " .. name)
end

return { find_user = find_user, run_cmd = run_cmd, API_KEY = API_KEY }
