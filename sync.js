const fs = require('fs');
const https = require('https');

const TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DATABASE_ID;

function notionRequest(path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.notion.com',
      path: '/v1/' + path,
      method: body ? 'POST' : 'GET',
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('Bad JSON: ' + raw)); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function fetchPosts() {
  console.log('Querying Notion database...');

  const db = await notionRequest('databases/' + DB_ID + '/query', {
    sorts: [{ timestamp: 'created_time', direction: 'descending' }]
  });

  if (db.object === 'error') {
    throw new Error('Notion API error: ' + db.message);
  }

  console.log('Found ' + db.results.length + ' rows');

  const posts = await Promise.all(db.results.map(async (page) => {
    const blocks = await notionRequest('blocks/' + page.id + '/children');

    const getText = (arr) => (arr || []).map(t => {
      let s = t.plain_text;
      if (t.annotations.bold) s = '<strong>' + s + '</strong>';
      if (t.annotations.italic) s = '<em>' + s + '</em>';
      if (t.annotations.code) s = '<code>' + s + '</code>';
      return s;
    }).join('');

    const content = (blocks.results || []).map(b => {
      const type = b.type;
      if (type === 'paragraph') return '<p>' + getText(b.paragraph.rich_text) + '</p>';
      if (type === 'heading_1') return '<h1>' + getText(b.heading_1.rich_text) + '</h1>';
      if (type === 'heading_2') return '<h2>' + getText(b.heading_2.rich_text) + '</h2>';
      if (type === 'heading_3') return '<h3>' + getText(b.heading_3.rich_text) + '</h3>';
      if (type === 'bulleted_list_item') return '<li>' + getText(b.bulleted_list_item.rich_text) + '</li>';
      if (type === 'numbered_list_item') return '<li>' + getText(b.numbered_list_item.rich_text) + '</li>';
      if (type === 'quote') return '<blockquote>' + getText(b.quote.rich_text) + '</blockquote>';
      if (type === 'image') {
        const url = b.image.type === 'external' ? b.image.external.url : b.image.file.url;
        return '<img src="' + url + '" alt="" />';
      }
      if (type === 'divider') return '<hr/>';
      return '';
    }).join('');

    const props = page.properties;
    const titleProp = props.title || props.Title || props.Name;
    const dateProp = props.date || props.Date;
    const tagsProp = props.tags || props.Tags;

    return {
      id: page.id,
      title: titleProp?.title?.[0]?.plain_text || 'Untitled',
      date: dateProp?.date?.start || '',
      tags: tagsProp?.multi_select?.map(t => t.name) || [],
      cover: page.cover?.external?.url || page.cover?.file?.url || '',
      content
    };
  }));

  fs.mkdirSync('posts', { recursive: true });
  fs.writeFileSync('posts/index.json', JSON.stringify(posts, null, 2));
  console.log('Done! Saved ' + posts.length + ' posts to posts/index.json');
}

fetchPosts().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
