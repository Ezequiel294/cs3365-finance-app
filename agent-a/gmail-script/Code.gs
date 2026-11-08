/**
 * Finance App — Gmail ingest script.
 *
 * This script runs in YOUR Google account, not in AWS. Every 5 minutes it looks for bank alert
 * emails from the senders the app supports and sends each one (its raw MIME) to the app. The app
 * never sees your Google or bank password; it only receives the alert emails this script sends.
 *
 * Setup:
 *   1. Open https://script.google.com, create a new project, and replace Code.gs with this file.
 *   2. Project Settings (gear icon) → Script properties → Add script property:
 *        Property: INGEST_TOKEN    Value: the token the app showed you once on the Connections page
 *      The token is kept only in Script properties. Never paste it into this file.
 *   3. Select the function `setup` and click Run. Approve the permissions Google asks for.
 *      The log says "Connected" when the app accepted the token.
 *
 * To disconnect, revoke the connection in the app. The next run gets 401 and removes its own trigger.
 */

var API_BASE = '__API_BASE__';
var DEFAULT_LABEL = 'financeapp-processed';
var MAX_THREADS_PER_RUN = 25;
var CONFIG_REFRESH_MS = 6 * 60 * 60 * 1000;

/** Checks the token with the app, then creates the 5-minute trigger for run(). */
function setup() {
  var config = fetchConfig_();
  if (!config) {
    throw new Error('Setup failed: the app rejected the ingest token. Check INGEST_TOKEN in Script properties. ' +
      'CSV import and manual entry keep working without this connection.');
  }
  removeTriggers_();
  ScriptApp.newTrigger('run').timeBased().everyMinutes(5).create();
  getOrCreateLabel_(config.label);
  Logger.log('Connected. Watching ' + config.senders.length + ' bank sender(s): ' + config.senders.join(', '));
}

/** Sends every new allowlisted bank email to the app, then reports a heartbeat. */
function run() {
  var config = cachedConfig_();
  if (!config) return; // token revoked: fetchConfig_ already removed the trigger
  var label = getOrCreateLabel_(config.label);
  var threads = findUnprocessed_(config.senders, config.label);
  var senders = config.senders.map(function (s) { return s.toLowerCase(); });

  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    var allSent = true;
    for (var m = 0; m < messages.length; m++) {
      if (senders.indexOf(addressOf_(messages[m].getFrom())) === -1) continue;
      var status = send_(messages[m]);
      if (status === 401) {
        removeTriggers_();
        Logger.log('The app rejected the token (revoked). The trigger was removed.');
        return;
      }
      if (status < 200 || status >= 300) allSent = false; // left unlabelled, retried next run
    }
    if (allSent) markProcessed_(threads[t], label);
  }
  heartbeat_();
}

function token_() {
  var token = PropertiesService.getScriptProperties().getProperty('INGEST_TOKEN');
  if (!token) throw new Error('Add INGEST_TOKEN in Project Settings → Script properties first.');
  return token;
}

function request_(method, path, payload) {
  var options = {
    method: method,
    headers: { Authorization: 'Bearer ' + token_() },
    muteHttpExceptions: true,
    followRedirects: false
  };
  if (payload !== undefined) {
    options.contentType = 'text/plain; charset=utf-8';
    options.payload = payload;
  }
  return UrlFetchApp.fetch(API_BASE + path, options);
}

/** GET /ingest/gmail/config → { senders, label }, or null when the token is rejected. */
function fetchConfig_() {
  var response = request_('get', '/ingest/gmail/config');
  var code = response.getResponseCode();
  if (code === 401) {
    removeTriggers_();
    return null;
  }
  if (code !== 200) throw new Error('The app could not be reached (HTTP ' + code + '). Try again later.');
  var config = JSON.parse(response.getContentText());
  if (!config.label) config.label = DEFAULT_LABEL;
  var props = PropertiesService.getScriptProperties();
  props.setProperty('CONFIG', JSON.stringify(config));
  props.setProperty('CONFIG_AT', String(Date.now()));
  return config;
}

function cachedConfig_() {
  var props = PropertiesService.getScriptProperties();
  var at = Number(props.getProperty('CONFIG_AT') || 0);
  var cached = props.getProperty('CONFIG');
  if (cached && Date.now() - at < CONFIG_REFRESH_MS) return JSON.parse(cached);
  return fetchConfig_();
}

/** Threads from allowlisted senders that are not labelled as processed yet. */
function findUnprocessed_(senders, labelName) {
  if (!senders || senders.length === 0) return [];
  var query = 'from:(' + senders.join(' OR ') + ') -label:' + labelName + ' newer_than:14d';
  return GmailApp.search(query, 0, MAX_THREADS_PER_RUN);
}

/** POST /ingest/gmail with the raw MIME. Returns the HTTP status. Re-sending a message is harmless: the app skips repeats. */
function send_(message) {
  try {
    return request_('post', '/ingest/gmail', message.getRawContent()).getResponseCode();
  } catch (e) {
    return 0; // network error: retry next run
  }
}

/** Labels a thread only after every message in it was accepted with a 2xx. */
function markProcessed_(thread, label) {
  thread.addLabel(label);
}

function heartbeat_() {
  try {
    var code = request_('post', '/ingest/gmail/heartbeat', '').getResponseCode();
    if (code === 401) removeTriggers_();
  } catch (e) {
    // the next run tries again
  }
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

function addressOf_(from) {
  var match = /<([^>]+)>/.exec(from);
  return (match ? match[1] : from).trim().toLowerCase();
}
