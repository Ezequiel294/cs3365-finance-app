/**
 * Finance App: Gmail forwarder for BAC Credomatic and Banco Nacional alert emails.
 *
 * 1. Open script.google.com, create a project, and paste this file into Code.gs.
 * 2. In Project Settings, under Script properties, add INGEST_TOKEN with the key the
 *    Connections page showed you (it is shown only once).
 * 3. Choose the setup function, click Run, and approve the Gmail permissions.
 *
 * The key is read from Script properties and never written in this file. Only messages
 * from the bank alert senders are read; each is labelled "financeapp-processed" once the
 * app has accepted it, so a failed delivery is retried on the next run.
 */
var apiBase = '__API_BASE__';
var DEFAULT_LABEL = 'financeapp-processed';
var MAX_THREADS_PER_RUN = 50;

/** Checks the key, then runs `run` every 5 minutes. */
function setup() {
  var config = fetchConfig();
  if (!config) {
    throw new Error('The key was not accepted. Copy the key from the Connections page into INGEST_TOKEN and run setup again.');
  }
  removeTriggers();
  ScriptApp.newTrigger('run').timeBased().everyMinutes(5).create();
  getLabel(config.label);
  Logger.log('Connected. Bank alert emails will be sent every 5 minutes.');
}

/** Sends every unprocessed alert email, then a heartbeat. */
function run() {
  var config = fetchConfig();
  if (!config) return;
  var messages = findUnprocessed(config.senders, config.label);
  for (var i = 0; i < messages.length; i++) {
    var status = send(messages[i].message);
    if (status === 401) {
      // The key was revoked: stop the trigger.
      removeTriggers();
      return;
    }
    if (status >= 200 && status < 300) {
      messages[i].done = true;
    } else {
      messages[i].failed = true;
    }
  }
  // Label a thread only when all of its messages were accepted.
  var threads = {};
  for (var j = 0; j < messages.length; j++) {
    var id = messages[j].thread.getId();
    threads[id] = threads[id] || { thread: messages[j].thread, ok: true };
    if (!messages[j].done) threads[id].ok = false;
  }
  for (var key in threads) {
    if (threads[key].ok) markProcessed(threads[key].thread, config.label);
  }
  heartbeat();
}

/** GET /ingest/gmail/config: the sender allowlist and the label. Null when the key is not accepted. */
function fetchConfig() {
  var res = call('get', '/ingest/gmail/config', null);
  if (res.getResponseCode() === 401) {
    removeTriggers();
    return null;
  }
  if (res.getResponseCode() !== 200) return null;
  var body = JSON.parse(res.getContentText());
  return { senders: body.senders || [], label: body.label || DEFAULT_LABEL };
}

/** Allowlisted senders without the processed label. */
function findUnprocessed(senders, label) {
  if (!senders.length) return [];
  var query = 'from:(' + senders.join(' OR ') + ') -label:' + label;
  var threads = GmailApp.search(query, 0, MAX_THREADS_PER_RUN);
  var out = [];
  for (var i = 0; i < threads.length; i++) {
    var msgs = threads[i].getMessages();
    for (var j = 0; j < msgs.length; j++) out.push({ thread: threads[i], message: msgs[j], done: false });
  }
  return out;
}

/** POST /ingest/gmail with the raw MIME; returns the HTTP status. */
function send(message) {
  var res = call('post', '/ingest/gmail', message.getRawContent());
  return res.getResponseCode();
}

function markProcessed(thread, label) {
  thread.addLabel(getLabel(label));
}

/** POST /ingest/gmail/heartbeat, so a week without purchases does not look like a broken connection. */
function heartbeat() {
  call('post', '/ingest/gmail/heartbeat', '{}');
}

function call(method, path, payload) {
  var token = PropertiesService.getScriptProperties().getProperty('INGEST_TOKEN');
  if (!token) throw new Error('Add INGEST_TOKEN under Project Settings > Script properties.');
  var options = {
    method: method,
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
    followRedirects: false,
  };
  if (payload !== null) {
    options.contentType = 'text/plain; charset=utf-8';
    options.payload = payload;
  }
  return UrlFetchApp.fetch(apiBase + path, options);
}

function getLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function removeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'run') ScriptApp.deleteTrigger(triggers[i]);
  }
}
