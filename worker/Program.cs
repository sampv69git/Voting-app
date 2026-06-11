using System;
using System.Data.Common;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using Newtonsoft.Json;
using Npgsql;
using StackExchange.Redis;

namespace Worker
{
    public class Program
    {
        public static int Main(string[] args)
        {
            try
            {
                var rawDbUrl = Environment.GetEnvironmentVariable("DATABASE_URL") ?? "Server=db;Username=postgres;Password=postgres;";
                var dbConnString = ConvertPostgresUrl(rawDbUrl);

                // Railway injects REDIS_URL as a full redis:// URL; fall back to REDIS_HOST for local Docker
                var redisUrl = Environment.GetEnvironmentVariable("REDIS_URL");
                var redisHost = Environment.GetEnvironmentVariable("REDIS_HOST") ?? "redis";

                Console.WriteLine($"Connecting to DB...");
                var pgsql = OpenDbConnection(dbConnString);

                Console.WriteLine($"Connecting to Redis...");
                var redisConn = string.IsNullOrEmpty(redisUrl)
                    ? OpenRedisConnection(redisHost)
                    : OpenRedisConnectionByUrl(redisUrl);
                var redis = redisConn.GetDatabase();

                var definition = new { vote = "", voter_id = "" };

                while (true)
                {
                    Thread.Sleep(100);

                    // Reconnect Redis if needed
                    if (redisConn == null || !redisConn.IsConnected)
                    {
                        Console.WriteLine("Reconnecting Redis");
                        redisConn = string.IsNullOrEmpty(redisUrl)
                            ? OpenRedisConnection(redisHost)
                            : OpenRedisConnectionByUrl(redisUrl);
                        redis = redisConn.GetDatabase();
                    }

                    string json = redis.ListLeftPop("votes");
                    if (json != null)
                    {
                        var vote = JsonConvert.DeserializeAnonymousType(json, definition);
                        Console.WriteLine($"Processing vote for '{vote.vote}' by '{vote.voter_id}'");

                        // Reconnect DB if needed
                        if (pgsql == null || pgsql.State != System.Data.ConnectionState.Open)
                        {
                            Console.WriteLine("Reconnecting DB");
                            pgsql = OpenDbConnection(dbConnString);
                        }

                        UpdateVote(pgsql, vote.voter_id, vote.vote);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(ex.ToString());
                return 1;
            }
        }

        private static NpgsqlConnection OpenDbConnection(string connectionString)
        {
            NpgsqlConnection connection = null;

            while (true)
            {
                try
                {
                    connection = new NpgsqlConnection(connectionString);
                    connection.Open();
                    break;
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"Waiting for db: {ex.Message}");
                    Thread.Sleep(1000);
                }
            }

            Console.Error.WriteLine("Connected to db");

            using (var command = connection.CreateCommand())
            {
                command.CommandText = @"CREATE TABLE IF NOT EXISTS votes (
                    id VARCHAR(255) NOT NULL UNIQUE,
                    vote VARCHAR(255) NOT NULL
                )";
                command.ExecuteNonQuery();
            }

            return connection;
        }

        private static ConnectionMultiplexer OpenRedisConnectionByUrl(string redisUrl)
        {
            // StackExchange.Redis does NOT understand redis:// URLs.
            // Parse the URL manually and build ConfigurationOptions.
            var options = BuildRedisOptions(redisUrl);

            while (true)
            {
                try
                {
                    Console.Error.WriteLine($"Connecting to redis at {string.Join(",", options.EndPoints)}");
                    return ConnectionMultiplexer.Connect(options);
                }
                catch (RedisConnectionException ex)
                {
                    Console.Error.WriteLine($"Waiting for redis: {ex.Message}");
                    Thread.Sleep(1000);
                }
            }
        }

        private static ConfigurationOptions BuildRedisOptions(string redisUrl)
        {
            // Parse redis://user:password@host:port or rediss://... (TLS)
            var uri = new Uri(redisUrl);

            string user = null;
            string password = null;
            if (!string.IsNullOrEmpty(uri.UserInfo))
            {
                var parts = uri.UserInfo.Split(':');
                user = Uri.UnescapeDataString(parts[0]);
                if (parts.Length > 1)
                {
                    password = Uri.UnescapeDataString(parts[1]);
                }
            }

            var port = uri.Port > 0 ? uri.Port : 6379;

            var options = new ConfigurationOptions
            {
                AbortOnConnectFail = false,
                ConnectRetry = 5,
                ConnectTimeout = 15000,
                // Railway internal hostnames resolve to IPv6 — let the OS resolve
                // and allow either family. ResolveDns avoids StackExchange's own
                // IPv4-only resolution path.
                ResolveDns = false
            };
            options.EndPoints.Add(uri.Host, port);

            // 'default' is the standard Redis ACL username; only set if non-default
            if (!string.IsNullOrEmpty(user) && user != "default")
            {
                options.User = user;
            }
            if (!string.IsNullOrEmpty(password))
            {
                options.Password = password;
            }

            // rediss:// scheme means TLS
            if (uri.Scheme.Equals("rediss", StringComparison.OrdinalIgnoreCase))
            {
                options.Ssl = true;
                options.SslHost = uri.Host;
            }

            Console.WriteLine($"Redis config -> Host={uri.Host}, Port={port}, User={user ?? "(none)"}, Ssl={options.Ssl}");
            return options;
        }

        private static ConnectionMultiplexer OpenRedisConnection(string hostname)
        {
            // Resolve hostname to IP to work around StackExchange.Redis DNS issue
            string target = hostname;
            try
            {
                var ipAddress = Dns.GetHostEntryAsync(hostname)
                    .Result
                    .AddressList
                    .First(a => a.AddressFamily == AddressFamily.InterNetwork)
                    .ToString();
                target = ipAddress;
                Console.WriteLine($"Resolved {hostname} -> {target}");
            }
            catch
            {
                Console.WriteLine($"Could not resolve {hostname}, using as-is");
            }

            while (true)
            {
                try
                {
                    Console.Error.WriteLine($"Connecting to redis at {target}");
                    return ConnectionMultiplexer.Connect(target);
                }
                catch (RedisConnectionException)
                {
                    Console.Error.WriteLine("Waiting for redis");
                    Thread.Sleep(1000);
                }
            }
        }

        private static void UpdateVote(NpgsqlConnection connection, string voterId, string vote)
        {
            try
            {
                // Use UPSERT (INSERT ... ON CONFLICT DO UPDATE) — atomic, no race condition
                using (var command = connection.CreateCommand())
                {
                    command.CommandText = @"
                        INSERT INTO votes (id, vote) VALUES (@id, @vote)
                        ON CONFLICT (id) DO UPDATE SET vote = EXCLUDED.vote";
                    command.Parameters.AddWithValue("@id", voterId);
                    command.Parameters.AddWithValue("@vote", vote);
                    command.ExecuteNonQuery();
                }
                Console.WriteLine($"Vote stored: voter={voterId} choice={vote}");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Failed to store vote: {ex.Message}");
            }
        }

        private static string ConvertPostgresUrl(string url)
        {
            // If it doesn't start with postgres:// or postgresql://, treat as ADO.NET connection string
            if (!url.StartsWith("postgres://") && !url.StartsWith("postgresql://"))
            {
                return url;
            }

            try
            {
                var uri = new Uri(url.Replace("postgresql://", "postgres://").Replace("postgres://", "http://"));
                var userInfo = uri.UserInfo.Split(':');
                var username = Uri.UnescapeDataString(userInfo[0]);
                var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
                var host = uri.Host;
                var port = uri.Port > 0 ? uri.Port : 5432;
                var database = uri.AbsolutePath.TrimStart('/');

                var connStr = $"Host={host};Port={port};Username={username};Password={password};Database={database}";

                // Add SSL for cloud providers (not local docker db)
                if (!host.Equals("db", StringComparison.OrdinalIgnoreCase) &&
                    !host.Equals("localhost", StringComparison.OrdinalIgnoreCase) &&
                    !host.Equals("127.0.0.1"))
                {
                    connStr += ";SSL Mode=Require;Trust Server Certificate=true";
                }

                Console.WriteLine($"Parsed DATABASE_URL -> Host={host}, Port={port}, Database={database}, User={username}");
                return connStr;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Failed to parse DATABASE_URL: {ex.Message}, using raw value");
                return url;
            }
        }
    }
}
