const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');

const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const OUTPUT_PATH = path.join(process.cwd(), 'emails.jsonl');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

async function getAndWriteEmails() {
  const auth = await authorize();
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10,
    });

    const messages = res.data.messages;
    if (messages.length) {
      const writeStream = fs.createWriteStream(OUTPUT_PATH, { flags: 'a' });

      for (const message of messages) {
        const email = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full',
        });

        const subject = email.data.payload.headers.find(
          (h) => h.name.toLowerCase() === 'subject',
        ).value;
        const rawContent = getTextFromParts(email.data.payload.parts);
        const date = email.data.payload.headers.find(
          (h) => h.name.toLowerCase() === 'date',
        ).value;

        const emailObject = {
          id: message.id,
          subject: subject,
          content: rawContent,
          date: date,
        };

        writeStream.write(JSON.stringify(emailObject) + '\n');

        console.log(`Processed email: ${subject}`);
      }

      writeStream.end();
      console.log(`Emails written to ${OUTPUT_PATH}`);
    } else {
      console.log('No messages found.');
    }
  } catch (error) {
    console.error('The API returned an error: ' + error);
  }
}

function getTextFromParts(parts) {
  if (!parts) return '';

  let text = '';
  for (const part of parts) {
    if (part.mimeType === 'text/plain') {
      text += Buffer.from(part.body.data, 'base64').toString('utf-8');
    } else if (part.parts) {
      text += getTextFromParts(part.parts);
    }
  }
  return text;
}

async function authorize() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0],
  );

  try {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  } catch (err) {
    return getNewToken(oAuth2Client);
  }
}

async function getNewToken(oAuth2Client) {
  return new Promise((resolve, reject) => {
    const server = http
      .createServer(async (req, res) => {
        try {
          const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
          const code = qs.get('code');
          console.log(`Code is ${code}`);
          res.end('Authentication successful! You can close this window.');
          server.close();

          const { tokens } = await oAuth2Client.getToken(code);
          oAuth2Client.setCredentials(tokens);
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
          console.log('Token stored to', TOKEN_PATH);
          resolve(oAuth2Client);
        } catch (err) {
          reject(err);
        }
      })
      .listen(3000, () => {
        const authUrl = oAuth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: SCOPES,
          redirect_uri: 'http://localhost:3000',
        });
        console.log('Authorize this app by visiting this url:', authUrl);
        console.log(
          `After granting permission, you will be redirected to a page that says "This site can't be reached".`,
        );
        console.log(
          'This is expected. Copy the entire URL of that page and paste it here:',
        );
      });
  });
}

getAndWriteEmails();
