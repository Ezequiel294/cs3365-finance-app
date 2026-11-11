/**
 * Finance App: Gmail ingest script.
 *
 * Runs in your own Google account (script.google.com). It forwards BAC Credomatic
 * and Banco Nacional card alert emails to the Finance App, so purchases arrive
 * without typing them. The app never sees your Gmail or bank password.
 *
 * Setup:
 *   1. Paste this file into a new Apps Script project.
 *   2. Project Settings → Script properties → add INGEST_TOKEN with the token the
 *      Connections page showed you (it is shown only once).
 *   3. Select the `setup` function and click Run. Approve the Gmail permissions.
 *
 * The token is read from Script Properties and is never written in this file.
 */

var API_BASE = '__API_BASE__';
var PROCESSED_LABEL = 'financeapp-processed';
var MAX_PER_RUN = 50;

/** Checks the token against the API, then creates a trigger that runs `run` every 5 minutes. */
function setup() {
  var config = fetchConfig_();
  if (!config) {
    throw new Error('Setup failed: the ingest token was rejected. CSV import and manual entry still work.');
  }
  removeTriggers_();
  ScriptApp.newTrigger('run').timeBased().everyMinutes(5).create();
  getOrCreateLabel_(config.label || PROCESSED_LABEL);
  Logger.log('Connected. Bank alerts will be sent every 5 minutes.');
}

/** Sends every new alert email from the allowlisted senders, then a heartbeat. */
function run() {
  var config = fetchConfig_();
  if (!config) return; // token revoked: fetchConfig_ already removed the trigger
  var label = getOrCreateLabel_(config.label || PROCESSED_LABEL);
  var processed = loadProcessed_();
  var threads = findUnprocessed_(config.senders || [], label.getName());
  for (var t = 0; t < threads.length; t++) {
    var allSent = true;
    for (var m = 0; m < threads[t].messages.length; m++) {
      var message = threads[t].messages[m];
      if (processed.indexOf(message.getId()) >= 0) continue;
      var status = send_(message);
      if (status === 401) {
        saveProcessed_(processed);
        removeTriggers_();
        return;
      }
      if (status >= 200 && status < 300) {
        processed.push(message.getId());
      } else {
        // Any other status leaves the email unlabelled, so it is sent again on the next run.
        allSent = false;
      }
    }
    if (allSent) markProcessed_(threads[t].thread, label);
  }
  saveProcessed_(processed);
  heartbeat_();
}

/** Ids of messages already accepted (Gmail labels whole threads, and BN alerts share one subject). */
function loadProcessed_() {
  var raw = PropertiesService.getScriptProperties().getProperty('PROCESSED_IDS');
  return raw ? JSON.parse(raw) : [];
}

function saveProcessed_(ids) {
  PropertiesService.getScriptProperties().setProperty('PROCESSED_IDS', JSON.stringify(ids.slice(-300)));
}

function token_() {
  var token = PropertiesService.getScriptProperties().getProperty('INGEST_TOKEN');
  if (!token) throw new Error('Add INGEST_TOKEN in Project Settings → Script properties.');
  return token;
}

function request_(method, path, payload, contentType) {
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token_() },
  };
  if (payload !== undefined) {
    options.payload = payload;
    options.contentType = contentType || 'application/json';
  }
  return UrlFetchApp.fetch(API_BASE + path, options);
}

/** GET /ingest/gmail/config: the sender allowlist. Returns null (and stops the trigger) on 401. */
function fetchConfig_() {
  var res = request_('get', '/ingest/gmail/config');
  var code = res.getResponseCode();
  if (code === 401) {
    removeTriggers_();
    return null;
  }
  if (code !== 200) throw new Error('Config request failed with HTTP ' + code);
  return JSON.parse(res.getContentText());
}

/**
 * Threads from the allowlisted senders without the processed label. Threads from the
 * last 2 days are searched as well, because a new alert can join a thread that was
 * already labelled; the server ignores an email it has already seen.
 */
function findUnprocessed_(senders, labelName) {
  if (!senders.length) return [];
  var query = 'from:(' + senders.join(' OR ') + ') {-label:' + labelName + ' newer_than:2d}';
  var threads = GmailApp.search(query, 0, MAX_PER_RUN);
  var result = [];
  for (var t = 0; t < threads.length; t++) {
    var msgs = threads[t].getMessages().filter(function (msg) {
      var from = String(msg.getFrom()).toLowerCase();
      return senders.some(function (s) { return from.indexOf(s.toLowerCase()) >= 0; });
    });
    if (msgs.length) result.push({ thread: threads[t], messages: msgs });
  }
  return result;
}

/** POST /ingest/gmail with the raw MIME. Returns the HTTP status. */
function send_(message) {
  var raw = message.getRawContent();
  var res = request_('post', '/ingest/gmail', raw, 'message/rfc822');
  return res.getResponseCode();
}

/** Labels a thread only after every message in it got a 2xx, so failures are retried on the next run. */
function markProcessed_(thread, label) {
  thread.addLabel(label);
}

/** POST /ingest/gmail/heartbeat keeps the connection from looking stale in a week without purchases. */
function heartbeat_() {
  request_('post', '/ingest/gmail/heartbeat', '{}');
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function removeTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'run') ScriptApp.deleteTrigger(triggers[i]);
  }
}
