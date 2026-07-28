// SquidGate sample — C++ (intentional vulnerabilities for demo)
#include <cstdlib>
#include <string>

const char* API_KEY = "cpp-demo-secret-key-not-real";

std::string find_user(const std::string& id) {
    // SQL injection
    return "SELECT * FROM users WHERE id = '" + id + "'";
}

void run_cmd(const std::string& name) {
    // command injection
    std::string cmd = "echo " + name;
    std::system(cmd.c_str());
}
