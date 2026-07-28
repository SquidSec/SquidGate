# SquidGate sample — Perl (intentional vulnerabilities for demo)
my $API_KEY = "perl-demo-secret-key-not-real";

sub find_user {
    my ($id) = @_;
    # SQL injection
    return "SELECT * FROM users WHERE id = '$id'";
}

sub run_cmd {
    my ($name) = @_;
    # command injection
    system("echo $name");
}
