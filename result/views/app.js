var app = angular.module('catsvsdogs', []);

app.controller('statsCtrl', function ($scope) {
  $scope.aPercent = 50;
  $scope.bPercent = 50;
  $scope.total = 0;

  var bg1 = document.getElementById('background-stats-1');
  var bg2 = document.getElementById('background-stats-2');

  // Render a fresh set of counts into the UI
  function render(a, b) {
    a = parseInt(a || 0, 10);
    b = parseInt(b || 0, 10);

    var percentages = getPercentages(a, b);

    if (bg1) bg1.style.width = percentages.a + '%';
    if (bg2) bg2.style.width = percentages.b + '%';

    var progressA = document.getElementById('progressA');
    var progressB = document.getElementById('progressB');
    if (progressA) progressA.style.width = percentages.a + '%';
    if (progressB) progressB.style.width = percentages.b + '%';

    updateCrown(percentages.a, percentages.b);

    $scope.$applyAsync(function () {
      $scope.aPercent = percentages.a;
      $scope.bPercent = percentages.b;
      $scope.total = a + b;
    });
  }

  document.body.style.opacity = 1;

  // -------------------------------------------------------------------------
  // Primary transport: Socket.IO (real-time)
  // -------------------------------------------------------------------------
  var socketConnected = false;
  var socket = null;

  try {
    socket = io({ transports: ['websocket', 'polling'], reconnection: true });

    socket.on('connect', function () {
      socketConnected = true;
      console.log('Socket connected');
    });

    socket.on('scores', function (json) {
      var data = JSON.parse(json);
      render(data.a, data.b);
    });

    socket.on('disconnect', function () {
      socketConnected = false;
      console.log('Socket disconnected — HTTP polling will cover');
    });

    socket.on('connect_error', function (err) {
      socketConnected = false;
      console.log('Socket connect_error:', err && err.message);
    });
  } catch (e) {
    console.log('Socket.IO unavailable, using HTTP polling only');
  }

  // -------------------------------------------------------------------------
  // Fallback transport: HTTP polling of /api/votes
  // Runs continuously but only updates the UI when the socket is NOT
  // currently delivering data, so the two never fight.
  // -------------------------------------------------------------------------
  function httpPoll() {
    fetch('/api/votes')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!socketConnected) {
          render(data.a, data.b);
        }
      })
      .catch(function (err) {
        console.log('HTTP poll failed:', err && err.message);
      })
      .finally(function () {
        setTimeout(httpPoll, 2000);
      });
  }

  // Kick off an immediate fetch so the page shows real data right away,
  // then keep polling as a safety net.
  httpPoll();
});

function getPercentages(a, b) {
  var result = {};
  if (a + b > 0) {
    result.a = Math.round((a / (a + b)) * 100);
    result.b = 100 - result.a;
  } else {
    result.a = result.b = 50;
  }
  return result;
}

function updateCrown(aPercent, bPercent) {
  document.querySelectorAll('.crown').forEach(function (el) { el.remove(); });
  if (aPercent === bPercent) return;
  var winner = aPercent > bPercent ? '.cats' : '.dogs';
  var winnerEl = document.querySelector(winner);
  if (winnerEl && !winnerEl.querySelector('.crown')) {
    var crown = document.createElement('span');
    crown.className = 'crown';
    crown.textContent = '\uD83D\uDC51';
    winnerEl.style.position = 'relative';
    winnerEl.appendChild(crown);
  }
}
