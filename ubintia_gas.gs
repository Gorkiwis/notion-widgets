/**
 * Ubintia Notion Sync 24/7 — Mediateka BBK Azkuna Zentroa
 * Lee automáticamente los correos de no-reply@amiprojects.com (Ubintia):
 *  - "Erreserba berria" -> Activa reserva
 *  - "Erreserba kendu da" -> Elimina reserva cancelada
 *  - "Erreserba iraungita" -> Elimina reserva caducada por no validar QR en 30 min
 *
 * Corre cada 5 minutos en la nube de Google (24/7, incluso con el PC apagado)
 * y actualiza GitHub Pages (Gorkiwis/notion-widgets/ubintia_data.json) cuando hay cambios.
 */

const UBINTIA_REGEX = /(\d+)\.Ikaspostua\s*(\d{2}-\d{2}-\d{4})\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/gi;

function parseUbintiaEmails() {
  const threads = GmailApp.search('from:no-reply@amiprojects.com newer_than:14d', 0, 50);
  const messages = [];

  for (const thread of threads) {
    const msgs = thread.getMessages();
    for (const msg of msgs) {
      const rawHtml = (msg.getBody() || '') + ' ' + (msg.getPlainBody() || '');
      const cleanText = rawHtml
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      messages.push({
        date: msg.getDate(),
        subject: (msg.getSubject() || '').trim(),
        body: cleanText
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
      const isoDate = parts[2] + '-' + parts[1] + '-' + parts[0];
      const key = isoDate + '_' + start + '_' + end + '_' + seat;

      if (isNew) {
        activeMap[key] = {
          seat: seat,
          seat_label: seat + '.Ikaspostua',
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
          seat_label: seat + '.Ikaspostua',
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

  const resultPayload = {
    updated_at: new Date().toISOString(),
    location: 'Mediateka BBK — Azkuna Zentroa (Ubintia)',
    account: Session.getActiveUser().getEmail() || 'gorkaobiangolaso@gmail.com',
    sender_filter: 'no-reply@amiprojects.com',
    cloud_verified: true,
    slots: slots,
    cancelled_or_expired: cancelledList.slice(-20)
  };

  try {
    const props = PropertiesService.getScriptProperties();
    const triggers = ScriptApp.getProjectTriggers();
    if (!triggers.some(t => t.getHandlerFunction() === 'parseUbintiaEmails')) {
      ScriptApp.newTrigger('parseUbintiaEmails').timeBased().everyMinutes(5).create();
      Logger.log('Trigger de 5 minutos (parseUbintiaEmails) instalado.');
    }
    pushPayloadToGitHub_(resultPayload, props.getProperty('GITHUB_TOKEN'));
  } catch (err) {
    Logger.log('Sync warning: ' + err);
  }

  return resultPayload;
}

function pushPayloadToGitHub_(payload, ghToken) {
  if (!ghToken) {
    Logger.log('No GITHUB_TOKEN found in ScriptProperties');
    return;
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
    try {
      const oldJson = JSON.parse(Utilities.newBlob(Utilities.base64Decode(existing.content)).getDataAsString());
      if (JSON.stringify(oldJson.slots) === JSON.stringify(payload.slots) && oldJson.cloud_verified === true) {
        Logger.log('Sin cambios en slots (' + payload.slots.length + '). No se requiere commit.');
        return;
      }
    } catch (e) {}
  }

  const body = {
    message: 'Cloud 24/7 Auto-sync Ubintia (' + payload.updated_at + ')',
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(payload, null, 2)).getBytes())
  };
  if (sha) body.sha = sha;

  const putResp = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + ghToken,
      'Accept': 'application/vnd.github+json'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  Logger.log('GitHub PUT status: ' + putResp.getResponseCode());
}

function doGet(e) {
  const payload = parseUbintiaEmails();
  return ContentService
    .createTextOutput(JSON.stringify(payload, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}
