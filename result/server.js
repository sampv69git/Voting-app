var express = require('express'),
    { Pool } = require('pg'),
    path = require('path'),
    cookieParser = require('cookie-parser'),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server);

var port = process.env.PORT || 4000;

io.on('connection', function (socket) {
  socket.emit('message', { text: 'Welcome!' });
  socket.on('subscribe', function (data) {
    socket.join(data.channel);
  });
});

// Build pool config — handle Railway's postgres:// URLs with SSL
var dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@db/postgres';
var poolConfig = { connectionString: dbUrl };

// Railway and most cloud providers require SSL
if (dbUrl && !dbUrl.includes('@db') && !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

var pool = new Pool(poolConfig);

function getVotes() {
  pool.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', [], function(err, result) {
    if (err) {
      console.error("Error performing query: " + err);
    } else {
      var votes = collectVotesFromResult(result);
      io.sockets.emit("scores", JSON.stringify(votes));
    }
    setTimeout(getVotes, 1000);
  });
}

function collectVotesFromResult(result) {
  var votes = { a: 0, b: 0 };
  result.rows.forEach(function (row) {
    votes[row.vote] = parseInt(row.count);
  });
  return votes;
}

// Wait for DB to be ready, then start polling
function waitForDb(retries) {
  retries = retries || 0;
  pool.query('SELECT 1', [], function(err) {
    if (err) {
      if (retries < 30) {
        console.error("Waiting for db... (" + retries + ")");
        setTimeout(function() { waitForDb(retries + 1); }, 2000);
      } else {
        console.error("Giving up waiting for db");
        // Start anyway — pool will retry per-query
        getVotes();
      }
    } else {
      console.log("Connected to db");
      getVotes();
    }
  });
}

waitForDb();

app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'views')));

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

server.listen(port, function () {
  console.log('App running on port ' + server.address().port);
});
