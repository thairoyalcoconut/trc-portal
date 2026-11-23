/**
 * TRC Portal — POS-ออกบูท summary email sender (Google Apps Script)
 *
 * Sends the end-of-shift summary from the Gmail account
 * maeicemahachai@gmail.com. Free; no DNS or third-party email service needed.
 * (Free Gmail can send to up to 100 recipients/day via Apps Script — plenty here.)
 *
 * Setup (once):
 *  1. Signed in as maeicemahachai@gmail.com, open https://script.google.com → New project.
 *     Paste this whole file, name the project "TRC POS Email".
 *  2. Project Settings (gear) → Script properties → Add:
 *        POS_SECRET = <a long random string>
 *     Use the SAME value for POS_EMAIL_WEBHOOK_SECRET in Vercel.
 *  3. Deploy → New deployment → type "Web app"
 *        Execute as: Me
 *        Who has access: Anyone
 *     → Deploy → authorize → copy the Web app URL (ends in /exec).
 *  4. In Vercel → trc-portal → Settings → Environment Variables add:
 *        POS_EMAIL_WEBHOOK_URL    = <the /exec URL>
 *        POS_EMAIL_WEBHOOK_SECRET = <same secret as step 2>
 *     then redeploy.
 *
 * "Anyone" access is safe here because every request must carry the secret;
 * requests without it are rejected and nothing is sent.
 */

var MAX_RECIPIENTS = 10;

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('POS_SECRET');
    if (!secret || body.secret !== secret) return json_({ ok: false, error: 'unauthorized' });

    var to = (body.to || []).filter(function (a) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(a));
    }).slice(0, MAX_RECIPIENTS);
    if (!to.length) return json_({ ok: false, error: 'no recipients' });

    MailApp.sendEmail({
      to: to.join(','),
      subject: String(body.subject || 'POS-ออกบูท summary'),
      body: String(body.text || ''),
      htmlBody: String(body.html || ''),
      name: 'TRC Portal — POS-ออกบูท',
    });
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
