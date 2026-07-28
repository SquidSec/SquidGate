// SquidGate sample — Java (intentional vulnerabilities for demo)
import java.sql.*;

public class UserDao {
    private static final String API_KEY = "java-demo-secret-key-not-real";

    public ResultSet find(Connection c, String id) throws SQLException {
        // SQL injection
        Statement s = c.createStatement();
        return s.executeQuery("SELECT * FROM users WHERE id = '" + id + "'");
    }

    public void run(String cmd) throws Exception {
        // command injection
        Runtime.getRuntime().exec("sh -c " + cmd);
    }
}
