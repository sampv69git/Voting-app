var express = require('express'),
    { Pool } = require('pg'),
    path = require('path'),
    cookieParser = require('cookie-parser'),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server, {
      cors: { origin: '*' }
    });

var port = process.env.PORT || 4000;

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------
var dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@db/postgres';
var poolConfig = { connectionString: dbUrl };

// Cloud providers (Railway/Render/etc.) require SSL; local docker db does not
if (dbUrl && !dbUrl.includes('@db') && !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

var pool = new Pool(poolConfig);

pool.on('error', function (err) {
  console.error('Unexpected idle client error:', err.message);
});

// Latest known vote counts — single source of truth shared by socket + HTTP
var latestVotes = { a: 0, b: 0 };

// Make sure the votes table exists (so the result app works even if the
// worker hasn't started yet — it just shows zeros instead of erroring).
function ensureTable(cb) {
  pool.query(
    'CREATE TABLE IF NOT EXISTS votes (id VARCHAR(255) NOT NULL UNIQUE, vote VARCHAR(255) NOT NULL)',
    function (err) {
      if (err) {
        console.error('Could not ensure votes table: ' + err.message);
      }
      if (cb) cb();
    }
  );
}

function collectVotesFromResult(result) {
  var votes = { a: 0, b: 0 };
  result.rows.forEach(function (row) {
    votes[row.vote] = parseInt(row.count, 10);
  });
  return votes;
}

function pollVotes() {
  pool.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', function (err, result) {
    if (err) {
      console.error('Error querying votes: ' + err.message);
    } else {
      latestVotes = collectVotesFromResult(result);
      console.log('Votes -> a:' + latestVotes.a + ' b:' + latestVotes.b);
      io.sockets.emit('scores', JSON.stringify(latestVotes));
    }
    setTimeout(pollVotes, 1000);
  });
}

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------
io.on('connection', function (socket) {
  // Immediately send the current standings to the newly-connected client
  socket.emit('message', { text: 'Welcome!' });
  socket.emit('scores', JSON.stringify(latestVotes));

  socket.on('subscribe', function (data) {
    socket.join(data.channel);
  });
});

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'views')));

// JSON endpoint — open this directly in the browser to verify the DB counts.
// Returns e.g. {"a":3,"b":5,"total":8}
app.get('/api/votes', function (req, res) {
  pool.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', function (err, result) {
    if (err) {
      console.error('Error in /api/votes: ' + err.message);
      return res.status(500).json({ error: err.message });
    }
    var votes = collectVotesFromResult(result);
    votes.total = votes.a + votes.b;
    res.json(votes);
  });
});

// Simple health check
app.get('/healthz', function (req, res) {
  res.json({ ok: true });
});

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
ensureTable(function () {
  pollVotes();
});

server.listen(port, function () {
  console.log('App running on port ' + server.address().port);
});
