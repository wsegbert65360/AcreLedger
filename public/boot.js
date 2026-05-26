window.__acreledgerBootError = function (message) {
  var status = document.getElementById('boot-status');
  window.__acreledgerPendingBootError = message || 'unknown error';
  if (status) status.textContent = 'Startup error: ' + window.__acreledgerPendingBootError;
};
window.addEventListener('error', function (event) {
  var target = event.target || {};
  var source = target.src || target.href || '';
  var tagName = target.tagName ? target.tagName.toLowerCase() : '';
  if (tagName === 'link' || tagName === 'img') return;
  var message = event.message || (source ? 'failed to load ' + tagName + ': ' + source : 'failed to load app bundle');
  window.__acreledgerBootError(message);
}, true);
window.addEventListener('unhandledrejection', function (event) {
  var reason = event.reason && (event.reason.message || event.reason.toString());
  window.__acreledgerBootError(reason || 'unknown promise rejection');
});
window.setTimeout(function () {
  var status = document.getElementById('boot-status');
  if (status && window.__acreledgerPendingBootError) {
    status.textContent = 'Startup error: ' + window.__acreledgerPendingBootError;
  } else if (status) {
    status.textContent = 'Still loading. Restart the app or check the TestFlight build logs.';
  }
}, 10000);