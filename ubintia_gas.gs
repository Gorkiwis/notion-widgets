/**
 * Ubintia Notion Sync 24/7 — Mediateka BBK Azkuna Zentroa
 * Lee automáticamente los correos de no-reply@amiprojects.com (Ubintia):
 *  - "Erreserba berria" -> Activa reserva
 *  - "Erreserba kendu da" -> Elimina reserva cancelada
 *  - "Erreserba iraungita" -> Elimina reserva caducada por no validar QR en 30 min
 *
 * Expone JSON en tiempo real vía doGet() y sincroniza con GitHub Pages (Gorkiwis/notion-widgets).
 */

const UBINTIA_REGEX = /(\d+)\.Ikaspostua\s*(\d{2}-\d{2}-\d{4})\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/gi;

function parseUbintiaEmails() {
  const threads = GmailApp.search('from:no-reply@amiprojects.com newer_than:14d', 0, 50);
  const messages = [];

  for (const thread of threads) {
    const msgs = thread.getMessages();
    for (const msg of msgs) {
      messages.push({
        date: msg.getDate(),
        subject: (msg.getSubject() || '').trim(),
        body: (msg.getPlainBody() || msg.getBody() || '')
      });
    }
  }

  // Orden cronológico ascendente para aplicar altas y bajas en orden exacto
  messages.sort((a, b) => a.date.getTime() - b.date.getTime());

  const activeMap = {};
  const cancelledList = [];

  for (const m of messages) {
    const subj = m.subject.toLowerCase();
    const isNew = subj.includes('erreserba berria');
    const isRemoved = subj.includes('erreserba kendu da');
    const isExpired = subj.includes('erreserba iraungita');

    if (!isNew && !isRemoved && !isExpired) continue;

    let match;
    UBINTIA_REGEX.lastIndex = 0;
    while ((match = UBINTIA_REGEX.exec(m.body)) !== null) {
      const seat = parseInt(match[1], 10);
      const dmy = match[2]; // DD-MM-YYYY
      const start = match[3];
      const end = match[4];
      const parts = dmy.split('-');
      const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      const key = `${isoDate}_${start}_${end}_${seat}`;

      if (isNew) {
        activeMap[key] = {
          seat: seat,
          seat_label: `${seat}.Ikaspostua`,
          date: dmy,
          iso_date: isoDate,
          start: start,
          end: end,
          status: 'active',
          source_subject: 'Erreserba berria',
          email_timestamp: m.date.toISOString()
        };
      } else if (isRemoved || isExpired) {
        if (activeMap[key]) {
          delete activeMap[key];
        }
        cancelledList.push({
          seat: seat,
          seat_label: `${seat}.Ikaspostua`,
          date: dmy,
          iso_date: isoDate,
          start: start,
          end: end,
          status: isRemoved ? 'cancelled' : 'expired',
          source_subject: m.subject,
          email_timestamp: m.date.toISOString()
        });
      }
    }
  }

  const slots = Object.values(activeMap).sort((a, b) => {
    const cmp = a.iso_date.localeCompare(b.iso_date);
    if (cmp !== 0) return cmp;
    return a.start.localeCompare(b.start);
  });

  return {
    updated_at: new Date().toISOString(),
    location: 'Mediateka BBK — Azkuna Zentroa (Ubintia)',
    account: Session.getActiveUser().getEmail() || 'gorkaobiangolaso@gmail.com',
    sender_filter: 'no-reply@amiprojects.com',
    slots: slots,
    cancelled_or_expired: cancelledList.slice(-20)
  };
}

function doGet(e) {
  const payload = parseUbintiaEmails();
  return ContentService
    .createTextOutput(JSON.stringify(payload, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function syncUbintiaToGitHub() {
  const payload = parseUbintiaEmails();
  const ghToken = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!ghToken) {
    Logger.log('Parsed slots: ' + payload.slots.length);
    return payload;
  }

  const apiUrl = 'https://api.github.com/repos/Gorkiwis/notion-widgets/contents/ubintia_data.json';
  const getResp = UrlFetchApp.fetch(apiUrl, {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + ghToken,
      'Accept': 'application/vnd.github+json'
    },
    muteHttpExceptions: true
  });

  let sha = null;
  if (getResp.getResponseCode() === 200) {
    const existing = JSON.parse(getResp.getContentText());
    sha = existing.sha;
  }

  const body = {
    message: 'Auto-sync Ubintia reservations (' + payload.updated_at + ')',
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(payload, null, 2)).getBytes())
  };
  if (sha) body.sha = sha;

  UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + ghToken,
      'Accept': 'application/vnd.github+json'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  return payload;
}
