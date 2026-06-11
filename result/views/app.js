var app = angular.module('catsvsdogs', []);
var socket = io.connect();

var bg1 = document.getElementById('background-stats-1');
var bg2 = document.getElementById('background-stats-2');

app.controller('statsCtrl', function($scope){
  $scope.aPercent = 50;
  $scope.bPercent = 50;
  $scope.total = 0;

  // Register the scores listener ONCE — never inside a function that gets called repeatedly
  socket.on('scores', function (json) {
    var data = JSON.parse(json);
    var a = parseInt(data.a || 0);
    var b = parseInt(data.b || 0);

    var percentages = getPercentages(a, b);

    bg1.style.width = percentages.a + "%";
    bg2.style.width = percentages.b + "%";

    var progressA = document.getElementById('progressA');
    var progressB = document.getElementById('progressB');
    if (progressA) progressA.style.width = percentages.a + "%";
    if (progressB) progressB.style.width = percentages.b + "%";

    updateCrown(percentages.a, percentages.b);

    $scope.$apply(function () {
      $scope.aPercent = percentages.a;
      $scope.bPercent = percentages.b;
      $scope.total = a + b;
    });
  });

  socket.on('message', function(data) {
    document.body.style.opacity = 1;
  });

  // Make body visible immediately too (don't wait for message event)
  document.body.style.opacity = 1;
});

function getPercentages(a, b) {
  var result = {};
  if (a + b > 0) {
    result.a = Math.round(a / (a + b) * 100);
    result.b = 100 - result.a;
  } else {
    result.a = result.b = 50;
  }
  return result;
}

function updateCrown(aPercent, bPercent) {
  document.querySelectorAll('.crown').forEach(function(el) { el.remove(); });
  if (aPercent === bPercent) return;
  var winner = aPercent > bPercent ? '.cats' : '.dogs';
  var winnerEl = document.querySelector(winner);
  if (winnerEl && !winnerEl.querySelector('.crown')) {
    var crown = document.createElement('span');
    crown.className = 'crown';
    crown.textContent = '👑';
    winnerEl.style.position = 'relative';
    winnerEl.appendChild(crown);
  }
}
