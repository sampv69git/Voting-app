var express = require('express'),
    { Pool } = require('pg'),
    path = require('path'),
    app = express();

var port = process.env.PORT || 4000;

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
var dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@db/postgres';
var poolConfig = { connectionString: dbUrl };

// Cloud providers (Railway/Render) require SSL; local docker "db" does not.
if (dbUrl && !dbUrl.includes('@db') && !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

var pool = new Pool(poolConfig);

pool.on('error', function (err) {
  console.error('Idle client error:', err.message);
});

// Make sure the table exists so the page works even before any vote is cast.
pool.query(
  'CREATE TABLE IF NOT EXISTS votes (id VARCHAR(255) NOT NULL UNIQUE, vote VARCHAR(255) NOT NULL)',
  function (err) {
    if (err) console.error('Could not ensure votes table:', err.message);
    else console.log('votes table ready');
  }
);

function getCounts(cb) {
  pool.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', function (err, result) {
    if (err) return cb(err);
    var votes = { a: 0, b: 0 };
    result.rows.forEach(function (row) {
      votes[row.vote] = parseInt(row.count, 10);
    });
    votes.total = votes.a + votes.b;
    cb(null, votes);
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'views')));

// JSON source of truth — the page polls this.
app.get('/api/votes', function (req, res) {
  getCounts(function (err, votes) {
    if (err) {
      console.error('/api/votes error:', err.message);
      return res.status(500).json({ error: err.message, a: 0, b: 0, total: 0 });
    }
    console.log('Votes -> a:' + votes.a + ' b:' + votes.b);
    res.json(votes);
  });
});

app.get('/healthz', function (req, res) {
  res.json({ ok: true });
});

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.listen(port, function () {
  console.log('Result app running on port ' + port);
});
