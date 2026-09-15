# SquidGate sample — Ruby (intentional vulnerabilities for demo)
API_KEY = "ruby-demo-secret-key-not-real"

def find_user(id)
  # SQL injection
  "SELECT * FROM users WHERE id = '#{id}'"
end

def run(cmd)
  # command injection
  system("echo #{cmd}")
end

def load_data(payload)
  # unsafe deserialization
  Marshal.load(payload)
end
