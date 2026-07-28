/* SquidGate sample — C (intentional vulnerabilities for demo) */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *API_KEY = "c-demo-secret-key-not-real";

void find_user(const char *id, char *out, size_t n) {
    /* SQL injection via sprintf */
    snprintf(out, n, "SELECT * FROM users WHERE id = '%s'", id);
}

void run_cmd(const char *name) {
    char buf[256];
    /* command injection */
    snprintf(buf, sizeof(buf), "echo %s", name);
    system(buf);
}
