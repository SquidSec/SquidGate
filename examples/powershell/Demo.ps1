# SquidGate sample — PowerShell (intentional vulnerabilities for demo)
$ApiKey = "powershell-demo-secret-key-not-real"

function Find-User {
    param([string]$Id)
    # SQL injection
    $q = "SELECT * FROM users WHERE id = '$Id'"
    Invoke-Sqlcmd -Query $q
}

function Invoke-UserCode {
    param([string]$Code)
    # dangerous
    Invoke-Expression $Code
}
