// SquidGate sample — C# (intentional vulnerabilities for demo)
using System;
using System.Data.SqlClient;

public class UserService {
    private const string ApiKey = "csharp-demo-secret-NOT-REAL";

    public void Find(SqlConnection conn, string id) {
        // SQL injection
        var cmd = new SqlCommand("SELECT * FROM Users WHERE Id = '" + id + "'", conn);
        cmd.ExecuteReader();
    }

    public object Deserialize(string payload) {
        // insecure binary formatter pattern (demo)
        return System.Activator.CreateInstance(Type.GetType(payload));
    }
}
